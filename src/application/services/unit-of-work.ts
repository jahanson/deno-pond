import { Client, Transaction } from "@db/postgres";

/**
 * Unit of Work pattern implementation for PostgreSQL transactions.
 *
 * Provides transaction orchestration for operations that span multiple
 * repositories or require atomicity across multiple domain operations.
 * Follows clean architecture by keeping transaction concerns separate
 * from repository atomic operations.
 *
 * @example
 * ```typescript
 * const uow = new PostgresUnitOfWork(client);
 * await uow.execute(async (transactionalClient) => {
 *   const repo = new PostgresMemoryRepository(transactionalClient);
 *   await repo.save(memory1, tenantId);
 *   await repo.save(memory2, tenantId);
 *   // Both saves succeed or both are rolled back
 * });
 * ```
 */
export class PostgresUnitOfWork {
  constructor(private client: Client) {}

  /**
   * Execute multiple operations within a single database transaction.
   *
   * Provides automatic transaction management with commit/rollback semantics.
   * The callback receives a transaction object that should be passed to
   * repository constructors for the duration of the unit of work.
   *
   * @param operation - Async function that performs the transactional work
   * @returns Promise that resolves to the operation's return value
   * @throws Error Any operation within the transaction fails
   */
  async execute<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    const transaction = this.client.createTransaction("unit_of_work");

    try {
      await transaction.begin();
      const result = await operation(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Execute a read-only operation that doesn't require transaction isolation.
   *
   * Useful for complex queries that span multiple repositories but don't
   * need write consistency. Uses the base client without transaction overhead.
   *
   * @param operation - Async function that performs the read operation
   * @returns Promise that resolves to the operation's return value
   */
  async executeReadOnly<T>(
    operation: (client: Client) => Promise<T>,
  ): Promise<T> {
    return await operation(this.client);
  }
}
