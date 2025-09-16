-- Add UNIQUE constraints for proper upsert handling

-- Add unique constraints for tags (prevent duplicate tags per memory)
ALTER TABLE tags ADD CONSTRAINT tags_unique_per_memory UNIQUE (memory_id, slug);

-- Add unique constraints for entities (prevent duplicate entities per memory)
ALTER TABLE entities ADD CONSTRAINT entities_unique_per_memory UNIQUE (memory_id, text, type);

-- Add unique constraints for actions (prevent duplicate actions per memory)
ALTER TABLE actions ADD CONSTRAINT actions_unique_per_memory UNIQUE (memory_id, slug);

-- Add HNSW indexes for optimal pgvector performance
-- These provide better speed-recall tradeoffs than IVFFlat for most use cases

-- Cosine similarity index (most common for embeddings)
CREATE INDEX embeddings_vector_hnsw_cosine ON embeddings USING hnsw (vector vector_cosine_ops);

-- L2 distance index (Euclidean)
CREATE INDEX embeddings_vector_hnsw_l2 ON embeddings USING hnsw (vector vector_l2_ops);

-- Inner product index (dot product)
CREATE INDEX embeddings_vector_hnsw_ip ON embeddings USING hnsw (vector vector_ip_ops);

-- Note: The existing IVFFlat indexes from 001_initial_schema.sql will coexist
-- This gives the query planner options to choose the best index for each query