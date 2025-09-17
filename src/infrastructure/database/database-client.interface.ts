/**
 * Database client interface for dependency injection and testing.
 *
 * Abstracts the essential database operations needed by repositories,
 * enabling clean separation between business logic and specific database
 * implementation details. Makes testing easier with stub implementations
 * and future database migrations simpler.
 */
export interface IDatabaseClient {
  /**
   * Execute a parameterized query that returns structured row data.
   *
   * @param sql - SQL query with parameter placeholders
   * @param args - Optional query parameters
   * @returns Promise resolving to query result with typed rows
   */
  queryObject<T>(
    sql: TemplateStringsArray | string,
    ...args: unknown[]
  ): Promise<{ rows: T[] }>;

  /**
   * Execute a parameterized query optimized for simple operations.
   *
   * @param sql - SQL query with parameter placeholders
   * @param args - Optional query parameters
   * @returns Promise resolving to query result with row count (may be undefined)
   */
  queryArray(
    sql: TemplateStringsArray | string,
    ...args: unknown[]
  ): Promise<{ rowCount?: number }>;

  /**
   * Create a new database transaction for atomic operations.
   *
   * @param name - Optional transaction name for debugging
   * @returns Transaction object for begin/commit/rollback operations
   */
  createTransaction(name?: string): IDatabaseTransaction;
}

/**
 * Database transaction interface for atomic operations.
 *
 * Represents the minimal transaction contract needed by repositories
 * for safe multi-step database operations with rollback capability.
 */
export interface IDatabaseTransaction {
  /**
   * Execute a parameterized query that returns structured row data.
   */
  queryObject<T>(
    sql: TemplateStringsArray | string,
    ...args: unknown[]
  ): Promise<{ rows: T[] }>;

  /**
   * Execute a parameterized query optimized for simple operations.
   */
  queryArray(
    sql: TemplateStringsArray | string,
    ...args: unknown[]
  ): Promise<{ rowCount?: number }>;

  /**
   * Start the transaction.
   */
  begin(): Promise<void>;

  /**
   * Commit all changes in the transaction.
   */
  commit(): Promise<void>;

  /**
   * Rollback all changes in the transaction.
   */
  rollback(): Promise<void>;
}