import { Client, Pool } from "jsr:@db/postgres";

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
}

/**
 * Manages PostgreSQL database connections with support for both single clients
 * and connection pooling.
 *
 * Provides flexible connection management suitable for both development
 * (single client) and production (connection pool) environments. Includes
 * health checking and environment-based configuration.
 *
 * @example
 * ```typescript
 * // From environment variables
 * const connection = DatabaseConnection.fromEnv();
 *
 * // Initialize connection pool for production
 * const pool = await connection.initPool();
 * const client = await connection.getClient();
 *
 * // Or single client for development
 * const client = await connection.initClient();
 *
 * // Health check
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
   * Initialize connection pool for production use
   */
  async initPool(): Promise<Pool> {
    if (this.pool) return this.pool;

    this.pool = new Pool({
      hostname: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      tls: this.config.ssl ? { enabled: true } : undefined,
    }, this.config.poolSize || 10);

    return this.pool;
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<Client> {
    if (!this.pool) {
      await this.initPool();
    }

    return await this.pool!.connect();
  }

  /**
   * Initialize single client for development/testing
   */
  async initClient(): Promise<Client> {
    if (this.client) return this.client;

    this.client = new Client({
      hostname: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      tls: this.config.ssl ? { enabled: true } : undefined,
    });

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
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.queryArray`SELECT 1`;
      return true;
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }

  /**
   * Get database configuration from environment
   */
  static fromEnv(): DatabaseConnection {
    const config: DatabaseConfig = {
      host: Deno.env.get("DB_HOST") || "localhost",
      port: parseInt(Deno.env.get("DB_PORT") || "5432"),
      user: Deno.env.get("DB_USER") || "postgres",
      password: Deno.env.get("DB_PASSWORD") || "postgres",
      database: Deno.env.get("DB_NAME") || "pond",
      ssl: Deno.env.get("DB_SSL") === "true",
      poolSize: parseInt(Deno.env.get("DB_POOL_SIZE") || "10"),
    };

    return new DatabaseConnection(config);
  }
}
