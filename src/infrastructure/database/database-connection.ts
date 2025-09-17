import { Client, Pool, Transaction } from "@db/postgres";
import { getLogger } from "@logtape/logtape";

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
  private readonly logger = getLogger(["deno-pond", "database", "connection"]);

  /**
   * Creates a new database connection manager.
   *
   * @param config - Database configuration options
   */
  constructor(private config: DatabaseConfig) {
    const mode = this.getConnectionMode();
    this.logger.debug`🔌 DatabaseConnection initialized with mode: ${mode}`;
    this.logger.debug`📊 Configuration: ${
      this.config.databaseUrl ? "DATABASE_URL" : "discrete config"
    }, SSL: ${this.config.ssl ? "enabled" : "disabled"}`;
  }

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
    this.logger.debug`🔧 Executing withClient in ${mode} mode`;

    const startTime = performance.now();

    try {
      if (mode === "single") {
        // Initialize single client if not already done
        if (!this.client) {
          this.logger.debug`🚀 Initializing single client connection`;
          await this.initClient();
        }
        this.logger.debug`✅ Using existing single client connection`;
        const result = await fn(this.client!);

        const duration = Math.round(performance.now() - startTime);
        this.logger.debug`⚡ Client operation completed in ${duration}ms`;
        return result;
      } else {
        // Use pooled connection
        this.logger.debug`🏊 Acquiring connection from pool`;
        const pool = await this.initPool();
        const client = await pool.connect();
        try {
          this.logger.debug`✅ Pool connection acquired, executing operation`;
          const result = await fn(client);

          const duration = Math.round(performance.now() - startTime);
          this.logger.debug`⚡ Pool operation completed in ${duration}ms`;
          return result;
        } finally {
          client.release();
          this.logger.debug`🔄 Pool connection released`;
        }
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger
        .error`💥 Database operation failed after ${duration}ms: ${message}`;
      this.logger.debug`Full error: ${error}`;
      throw error;
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
  async withTransaction<T>(
    fn: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    this.logger.debug`🔄 Starting database transaction`;

    return await this.withClient(async (client) => {
      const transaction = client.createTransaction("user_transaction");
      const startTime = performance.now();
      let transactionStarted = false;
      let transactionCommitted = false;

      try {
        this.logger.debug`⚡ Beginning transaction`;
        await transaction.begin();
        transactionStarted = true;

        const result = await fn(transaction);

        this.logger.debug`💾 Committing transaction`;
        await transaction.commit();
        transactionCommitted = true;

        const duration = Math.round(performance.now() - startTime);
        this.logger
          .info`✅ Transaction committed successfully in ${duration}ms`;
        return result;
      } catch (error) {
        if (transactionStarted && !transactionCommitted) {
          this.logger.warning`🔄 Rolling back transaction due to error`;
          try {
            await transaction.rollback();
            this.logger.debug`✅ Transaction rollback successful`;
          } catch (rollbackError) {
            this.logger
              .error`🚨 CRITICAL: Failed to rollback transaction: ${rollbackError}`;
          }
        }

        const duration = Math.round(performance.now() - startTime);
        const message = error instanceof Error
          ? error.message
          : "unknown error";
        this.logger
          .error`💥 Transaction failed and rolled back after ${duration}ms: ${message}`;
        this.logger.debug`Full error: ${error}`;
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
    const sqlPreview = sql.join("?").substring(0, 100);
    this.logger.debug`📊 Executing queryObject: ${sqlPreview}${
      sqlPreview.length >= 100 ? "..." : ""
    }`;

    const startTime = performance.now();
    try {
      const result = await this.withClient(async (client) => {
        return await client.queryObject<T>(sql, ...values);
      });

      const duration = Math.round(performance.now() - startTime);
      this.logger
        .debug`✅ QueryObject completed - ${result.rows.length} rows in ${duration}ms`;
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.error`💥 QueryObject failed after ${duration}ms: ${message}`;
      this.logger.debug`Full error: ${error}`;
      throw error;
    }
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
    const sqlPreview = sql.join("?").substring(0, 100);
    this.logger.debug`📋 Executing queryArray: ${sqlPreview}${
      sqlPreview.length >= 100 ? "..." : ""
    }`;

    const startTime = performance.now();
    try {
      const result = await this.withClient(async (client) => {
        return await client.queryArray(sql, ...values);
      });

      const duration = Math.round(performance.now() - startTime);
      this.logger.debug`✅ QueryArray completed - ${
        result.rowCount || 0
      } rows in ${duration}ms`;
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger.error`💥 QueryArray failed after ${duration}ms: ${message}`;
      this.logger.debug`Full error: ${error}`;
      throw error;
    }
  }

  /**
   * Initialize connection pool for production use
   *
   * @param opts - Optional configuration for pool initialization
   */
  initPool(opts?: { lazy?: boolean }): Pool {
    if (this.pool) {
      this.logger.debug`✅ Reusing existing connection pool`;
      return this.pool;
    }

    const connectionConfig = this.getConnectionConfig();
    const lazy = opts?.lazy ?? (Deno.env.get("DB_POOL_LAZY") === "true");
    const poolSize = this.config.poolSize || 10;

    this.logger
      .info`🏊 Initializing connection pool - size: ${poolSize}, lazy: ${lazy}`;

    this.pool = new Pool(connectionConfig, poolSize, lazy);

    this.logger.info`✅ Connection pool initialized successfully`;
    return this.pool;
  }

  /**
   * Get connection configuration with proper TLS setup
   */
  private getConnectionConfig() {
    const buildTlsConfig = (sslMode?: string) => {
      const tlsRequested = this.config.ssl ??
        (sslMode ? sslMode !== "disable" : undefined);
      if (!tlsRequested && !this.config.caCertificate) {
        return undefined;
      }

      return {
        enabled: tlsRequested !== false,
        ...(this.config.caCertificate && {
          caCertificates: [this.config.caCertificate],
        }),
      };
    };

    if (this.config.databaseUrl) {
      const url = new URL(this.config.databaseUrl);
      const sslMode = url.searchParams.get("sslmode") ?? undefined;

      const hostname = url.hostname || this.config.host;
      const port = url.port ? Number(url.port) : this.config.port;
      const user = url.username
        ? decodeURIComponent(url.username)
        : this.config.user;
      const password = url.password
        ? decodeURIComponent(url.password)
        : this.config.password;
      const database = url.pathname && url.pathname !== "/"
        ? decodeURIComponent(url.pathname.replace(/^\//, ""))
        : this.config.database;

      return {
        hostname,
        port,
        user,
        password,
        database,
        tls: buildTlsConfig(sslMode),
      };
    }

    return {
      hostname: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      tls: buildTlsConfig(),
    };
  }

  /**
   * Initialize single client for development/testing
   */
  async initClient(): Promise<Client> {
    if (this.client) {
      this.logger.debug`✅ Reusing existing client connection`;
      return this.client;
    }

    this.logger.info`🔌 Initializing single client connection`;

    const connectionConfig = this.getConnectionConfig();
    this.logger
      .debug`🔗 Using resolved connection configuration for client setup`;
    this.client = new Client(connectionConfig);

    const startTime = performance.now();
    await this.client.connect();
    const duration = Math.round(performance.now() - startTime);

    this.logger.info`✅ Client connection established in ${duration}ms`;
    return this.client;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.logger.info`🔌 Closing database connections`;

    if (this.client) {
      this.logger.debug`📤 Closing single client connection`;
      await this.client.end();
      this.client = undefined;
      this.logger.debug`✅ Single client connection closed`;
    }

    if (this.pool) {
      this.logger.debug`🏊 Closing connection pool`;
      await this.pool.end();
      this.pool = undefined;
      this.logger.debug`✅ Connection pool closed`;
    }

    this.logger.info`🎯 All database connections closed successfully`;
  }

  /**
   * Health check for database connectivity
   *
   * Respects the configured connection mode. If resources aren't initialized
   * yet, performs a lightweight probe without creating persistent connections.
   */
  async healthCheck(): Promise<boolean> {
    this.logger.info`🏥 Starting database health check`;
    const startTime = performance.now();

    try {
      const mode = this.getConnectionMode();
      this.logger.debug`🔍 Health check in ${mode} mode`;

      if (mode === "single") {
        if (this.client) {
          this.logger.debug`✅ Using existing single client for health check`;
          // Use existing single client
          await this.client.queryArray`SELECT 1`;

          const duration = Math.round(performance.now() - startTime);
          this.logger
            .info`🎉 Health check PASSED using existing client in ${duration}ms`;
          return true;
        }
        this.logger
          .debug`⚠️  Single mode but no client - using lightweight probe`;
        // Single mode but no client yet - use probe without initializing persistent client
      } else { // mode === "pool"
        if (this.pool) {
          this.logger.debug`✅ Using existing pool for health check`;
          // Use existing pool with proper connection management
          const client = await this.pool.connect();
          try {
            await client.queryArray`SELECT 1`;

            const duration = Math.round(performance.now() - startTime);
            this.logger
              .info`🎉 Health check PASSED using pool in ${duration}ms`;
            return true;
          } finally {
            client.release();
          }
        }
        this.logger.debug`⚠️  Pool mode but no pool - using lightweight probe`;
        // Pool mode but no pool yet - use probe without initializing persistent pool
      }

      // Lightweight probe for uninitialized connections (both modes)
      this.logger.debug`🔍 Performing lightweight connection probe`;
      const oneOff = new Client(this.getConnectionConfig());

      try {
        await oneOff.connect();
        await oneOff.queryArray`SELECT 1`;

        const duration = Math.round(performance.now() - startTime);
        this.logger
          .info`🎉 Health check PASSED using probe connection in ${duration}ms`;
        return true;
      } finally {
        await oneOff.end();
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : "unknown error";
      this.logger
        .error`💥 Database health check FAILED after ${duration}ms: ${message}`;
      this.logger.debug`🔍 Health check error details: ${error}`;
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
    // Create a temporary logger for static method
    const staticLogger = getLogger(["deno-pond", "database", "config"]);
    staticLogger
      .debug`⚙️  Loading database configuration from environment variables`;

    const databaseUrl = Deno.env.get("DATABASE_URL");
    const env = Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV") ||
      "development";
    const explicitMode = Deno.env.get("DB_CONNECTION_MODE") as
      | "single"
      | "pool"
      | undefined;

    const dbSslEnv = Deno.env.get("DB_SSL");

    const config: DatabaseConfig = {
      host: Deno.env.get("DB_HOST") || "localhost",
      port: parseInt(Deno.env.get("DB_PORT") || "5432"),
      user: Deno.env.get("DB_USER") || "postgres",
      password: Deno.env.get("DB_PASSWORD") || "postgres",
      database: Deno.env.get("DB_NAME") || "pond",
      ssl: dbSslEnv !== undefined ? dbSslEnv === "true" : undefined,
      poolSize: parseInt(Deno.env.get("DB_POOL_SIZE") || "10"),
      databaseUrl: databaseUrl,
      caCertificate: Deno.env.get("DB_SSL_CERT"),
      mode: explicitMode || (env === "production" ? "pool" : "single"),
    };

    const configType = databaseUrl
      ? "DATABASE_URL"
      : "discrete environment variables";
    const finalMode = config.mode;

    staticLogger
      .info`✅ Database configuration loaded from ${configType} (mode: ${finalMode})`;

    return new DatabaseConnection(config);
  }
}
