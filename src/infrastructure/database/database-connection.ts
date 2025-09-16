import { Client, Pool, Transaction } from "@db/postgres";

/**
 * Configuration options for database connection.
 */
export interface DatabaseConfig {
  /** Database host/hostname */
  host: string;
  /** Database port number */
  port: number;
  /** Database username */
  user: string;
  /** Database password */
  password: string;
  /** Database name */
  database: string;
  /** Enable SSL/TLS connection (optional) */
  ssl?: boolean;
  /** Connection pool size for production use (optional, default: 10) */
  poolSize?: number;
  /** Database URL (alternative to discrete fields) */
  databaseUrl?: string;
  /** CA certificate for TLS verification (production) */
  caCertificate?: string;
  /** Connection mode: "pool" for production, "single" for development (optional) */
  mode?: "pool" | "single";
}

/**
 * Manages PostgreSQL database connections with support for both single clients
 * and connection pooling.
 *
 * Provides flexible connection management suitable for both development
 * (single client) and production (connection pool) environments. Automatically
 * handles connection lifecycle to prevent leaks.
 *
 * **Runtime Permissions Required:**
 * - `--allow-net` for database connections
 * - `--allow-env` for environment-based configuration
 *
 * @example
 * ```typescript
 * // Explicit mode configuration
 * const devConfig = { ...config, mode: "single" };
 * const prodConfig = { ...config, mode: "pool" };
 *
 * // Or from environment variables (auto-detects mode from NODE_ENV/DENO_ENV)
 * const connection = DatabaseConnection.fromEnv();
 *
 * // All operations use the configured mode automatically
 * const result = await connection.withClient(async (client) => {
 *   return await client.queryObject`SELECT * FROM users`;
 * });
 *
 * // Health check respects configured mode
 * const isHealthy = await connection.healthCheck();
 * ```
 */
export class DatabaseConnection {
  private pool?: Pool;
  private client?: Client;

  /**
   * Creates a new database connection manager.
   *
   * @param config - Database configuration options
   */
  constructor(private config: DatabaseConfig) {}

  /**
   * Execute a function with a managed database client.
   *
   * Automatically handles connection acquisition and release to prevent leaks.
   * Uses the configured connection mode (single client or pool).
   *
   * @param fn - Function to execute with the database client
   * @returns Promise resolving to the function's result
   */
  async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const mode = this.getConnectionMode();

    if (mode === "single") {
      // Initialize single client if not already done
      if (!this.client) {
        await this.initClient();
      }
      return await fn(this.client!);
    } else {
      // Use pooled connection
      const pool = await this.initPool();
      const client = await pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    }
  }

  /**
   * Determine the connection mode based on configuration or defaults.
   *
   * @returns The connection mode to use
   */
  private getConnectionMode(): "single" | "pool" {
    // Use explicit mode if configured
    if (this.config.mode) {
      return this.config.mode;
    }

    // Auto-detect from environment
    const env = Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV") ||
      "development";
    return env === "production" ? "pool" : "single";
  }

  /**
   * Execute a function within a database transaction.
   *
   * Automatically handles BEGIN/COMMIT/ROLLBACK semantics with proper
   * error handling and connection management.
   *
   * @param fn - Function to execute within the transaction
   * @returns Promise resolving to the function's result
   */
  async withTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T> {
    return await this.withClient(async (client) => {
      const transaction = client.createTransaction("user_transaction");

      try {
        await transaction.begin();
        const result = await fn(transaction);
        await transaction.commit();
        return result;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    });
  }

  /**
   * Execute a query and return results as objects.
   *
   * Convenience method that handles connection management automatically.
   *
   * @param sql - Template literal query
   * @returns Promise resolving to query results
   */
  async queryObject<T = Record<string, unknown>>(
    sql: TemplateStringsArray,
    ...values: unknown[]
  ) {
    return await this.withClient(async (client) => {
      return await client.queryObject<T>(sql, ...values);
    });
  }

  /**
   * Execute a query and return results as arrays.
   *
   * Convenience method that handles connection management automatically.
   *
   * @param sql - Template literal query
   * @returns Promise resolving to query results
   */
  async queryArray(sql: TemplateStringsArray, ...values: unknown[]) {
    return await this.withClient(async (client) => {
      return await client.queryArray(sql, ...values);
    });
  }

  /**
   * Initialize connection pool for production use
   *
   * @param opts - Optional configuration for pool initialization
   */
  initPool(opts?: { lazy?: boolean }): Pool {
    if (this.pool) return this.pool;

    const connectionConfig = this.getConnectionConfig();
    const lazy = opts?.lazy ?? (Deno.env.get("DB_POOL_LAZY") === "true");

    if (this.config.databaseUrl) {
      // Use DATABASE_URL if provided
      // Note: TLS options must be included in the URL (e.g., sslmode=require)
      this.pool = new Pool(
        this.config.databaseUrl,
        this.config.poolSize || 10,
        lazy,
      );
    } else {
      // Use discrete configuration with TLS options
      this.pool = new Pool(connectionConfig, this.config.poolSize || 10, lazy);
    }

    return this.pool;
  }

  /**
   * Get connection configuration with proper TLS setup
   */
  private getConnectionConfig() {
    const tlsConfig = this.config.ssl
      ? {
        enabled: true,
        ...(this.config.caCertificate && {
          caCertificates: [this.config.caCertificate],
        }),
      }
      : undefined;

    return {
      hostname: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      tls: tlsConfig,
    };
  }

  /**
   * Initialize single client for development/testing
   */
  async initClient(): Promise<Client> {
    if (this.client) return this.client;

    const connectionConfig = this.getConnectionConfig();

    if (this.config.databaseUrl) {
      // Note: TLS options must be included in the URL (e.g., sslmode=require)
      this.client = new Client(this.config.databaseUrl);
    } else {
      this.client = new Client(connectionConfig);
    }

    await this.client.connect();
    return this.client;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = undefined;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  /**
   * Health check for database connectivity
   *
   * Respects the configured connection mode. If resources aren't initialized
   * yet, performs a lightweight probe without creating persistent connections.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const mode = this.getConnectionMode();

      if (mode === "single") {
        if (this.client) {
          // Use existing single client
          await this.client.queryArray`SELECT 1`;
          return true;
        }
        // Single mode but no client yet - use probe without initializing persistent client
      } else { // mode === "pool"
        if (this.pool) {
          // Use existing pool with proper connection management
          const client = await this.pool.connect();
          try {
            await client.queryArray`SELECT 1`;
            return true;
          } finally {
            client.release();
          }
        }
        // Pool mode but no pool yet - use probe without initializing persistent pool
      }

      // Lightweight probe for uninitialized connections (both modes)
      const oneOff = this.config.databaseUrl
        ? new Client(this.config.databaseUrl)
        : new Client(this.getConnectionConfig());

      try {
        await oneOff.connect();
        await oneOff.queryArray`SELECT 1`;
        return true;
      } finally {
        await oneOff.end();
      }
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  /**
   * Get database configuration from environment variables
   *
   * Supports either DATABASE_URL or discrete environment variables.
   * DATABASE_URL takes precedence if present. Auto-detects connection
   * mode from NODE_ENV/DENO_ENV (production = pool, otherwise = single).
   */
  static fromEnv(): DatabaseConnection {
    const databaseUrl = Deno.env.get("DATABASE_URL");
    const env = Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV") ||
      "development";
    const explicitMode = Deno.env.get("DB_CONNECTION_MODE") as
      | "single"
      | "pool"
      | undefined;

    const config: DatabaseConfig = {
      host: Deno.env.get("DB_HOST") || "localhost",
      port: parseInt(Deno.env.get("DB_PORT") || "5432"),
      user: Deno.env.get("DB_USER") || "postgres",
      password: Deno.env.get("DB_PASSWORD") || "postgres",
      database: Deno.env.get("DB_NAME") || "pond",
      ssl: Deno.env.get("DB_SSL") === "true",
      poolSize: parseInt(Deno.env.get("DB_POOL_SIZE") || "10"),
      databaseUrl: databaseUrl,
      caCertificate: Deno.env.get("DB_SSL_CERT"),
      mode: explicitMode || (env === "production" ? "pool" : "single"),
    };

    return new DatabaseConnection(config);
  }
}
