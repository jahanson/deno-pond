-- Change vector column from vector(1536) to unbounded vector for multi-dimensional support
-- The dimensions column will continue to provide validation and diagnostics

-- Drop existing indexes that reference the old column type
DROP INDEX IF EXISTS idx_embeddings_vector_cosine;
DROP INDEX IF EXISTS idx_embeddings_vector_l2;
DROP INDEX IF EXISTS embeddings_vector_hnsw_cosine;
DROP INDEX IF EXISTS embeddings_vector_hnsw_l2;
DROP INDEX IF EXISTS embeddings_vector_hnsw_ip;

-- Change the vector column to unbounded
ALTER TABLE embeddings ALTER COLUMN vector TYPE vector USING vector::vector;

-- Recreate the original IVFFlat indexes with unbounded vector
CREATE INDEX idx_embeddings_vector_cosine ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_vector_l2 ON embeddings USING ivfflat (vector vector_l2_ops) WITH (lists = 100);

-- Recreate HNSW indexes for optimal pgvector performance
-- These provide better speed-recall tradeoffs than IVFFlat for most use cases

-- Cosine similarity index (most common for embeddings)
CREATE INDEX embeddings_vector_hnsw_cosine ON embeddings USING hnsw (vector vector_cosine_ops);

-- L2 distance index (Euclidean)
CREATE INDEX embeddings_vector_hnsw_l2 ON embeddings USING hnsw (vector vector_l2_ops);

-- Inner product index (dot product)
CREATE INDEX embeddings_vector_hnsw_ip ON embeddings USING hnsw (vector vector_ip_ops);

-- Note: The dimensions column continues to provide validation via CHECK constraint
-- and helps with diagnostics, query optimization, and dimension matching