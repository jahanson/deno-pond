-- Migration 3: Optimize vector indexing strategy while keeping vector(1536) for compatibility
-- Based on pgvector 0.8.0 requirements: ALL index types need fixed dimensions

-- DISCOVERY: pgvector 0.8.0 requires fixed dimensions for both IVFFlat AND HNSW indexes
-- Solution: Keep vector(1536) but optimize index configuration for better performance

-- Drop existing indexes to recreate with optimized settings
DROP INDEX IF EXISTS idx_embeddings_vector_cosine;
DROP INDEX IF EXISTS idx_embeddings_vector_l2;
DROP INDEX IF EXISTS embeddings_vector_hnsw_cosine;
DROP INDEX IF EXISTS embeddings_vector_hnsw_l2;
DROP INDEX IF EXISTS embeddings_vector_hnsw_ip;

-- Recreate IVFFlat indexes with better list configuration for 1536-dimensional vectors
-- Optimal lists = sqrt(rows), but we'll use conservative settings for future growth
CREATE INDEX idx_embeddings_vector_cosine ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_vector_l2 ON embeddings USING ivfflat (vector vector_l2_ops) WITH (lists = 100);

-- Create HNSW indexes for superior performance (better than IVFFlat for most queries)
-- HNSW provides better speed-recall tradeoffs and doesn't require list tuning

-- Cosine similarity index (most common for embeddings)
CREATE INDEX embeddings_vector_hnsw_cosine ON embeddings USING hnsw (vector vector_cosine_ops);

-- L2 distance index (Euclidean)
CREATE INDEX embeddings_vector_hnsw_l2 ON embeddings USING hnsw (vector vector_l2_ops);

-- Inner product index (dot product)
CREATE INDEX embeddings_vector_hnsw_ip ON embeddings USING hnsw (vector vector_ip_ops);

-- Note: Keeping vector(1536) ensures index compatibility with pgvector 0.8.0
-- For multi-dimensional support, consider separate tables per dimension or upgrade pgvector
-- The dimensions column continues to provide validation and can detect dimension mismatches