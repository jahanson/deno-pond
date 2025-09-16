-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector"; -- pgvector for embeddings

-- Custom types
CREATE TYPE memory_status AS ENUM ('DRAFT', 'STORED');
CREATE TYPE source_type AS ENUM ('claude-code', 'manual', 'import', 'api');

-- Main memories table (aggregate root)
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 7500),
    content_hash TEXT NOT NULL,
    status memory_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT memories_content_not_empty CHECK (length(trim(content)) > 0),
    CONSTRAINT memories_content_max_length CHECK (length(content) <= 7500)
);

-- Embeddings table (semantic vectors)
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    vector vector(1536) NOT NULL, -- Default to OpenAI dimensions, adjust as needed
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    model TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT embeddings_unique_memory UNIQUE (memory_id),
    CONSTRAINT embeddings_valid_dimensions CHECK (dimensions IN (128, 256, 384, 512, 768, 1024, 1536, 2048, 4096))
);

-- Sources table (provenance tracking)
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    type source_type NOT NULL,
    context TEXT NOT NULL CHECK (length(trim(context)) > 0 AND length(context) <= 1000),
    hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT sources_unique_memory UNIQUE (memory_id),
    CONSTRAINT sources_context_not_empty CHECK (length(trim(context)) > 0),
    CONSTRAINT sources_context_max_length CHECK (length(context) <= 1000)
);

-- Tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    raw TEXT NOT NULL,
    normalized TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT tags_raw_not_empty CHECK (length(trim(raw)) > 0)
);

-- Entities table (NLP extracted entities)
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT entities_text_not_empty CHECK (length(trim(text)) > 0),
    CONSTRAINT entities_type_not_empty CHECK (length(trim(type)) > 0)
);

-- Actions table (NLP extracted actions)
CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT actions_action_not_empty CHECK (length(trim(action)) > 0)
);

-- Indexes for performance

-- Tenant isolation (most important)
CREATE INDEX idx_memories_tenant_id ON memories (tenant_id);
CREATE INDEX idx_memories_tenant_created_at ON memories (tenant_id, created_at DESC);
CREATE INDEX idx_memories_tenant_status ON memories (tenant_id, status);

-- Content deduplication
CREATE INDEX idx_memories_content_hash ON memories (content_hash);
CREATE UNIQUE INDEX idx_memories_tenant_content_hash ON memories (tenant_id, content_hash);

-- Full-text search
CREATE INDEX idx_memories_content_fts ON memories USING gin (to_tsvector('english', content));

-- Embedding similarity search (requires pgvector)
CREATE INDEX idx_embeddings_vector_cosine ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_vector_l2 ON embeddings USING ivfflat (vector vector_l2_ops) WITH (lists = 100);

-- Source lookups
CREATE INDEX idx_sources_hash ON sources (hash);
CREATE INDEX idx_sources_type ON sources (type);

-- Tag searches
CREATE INDEX idx_tags_memory_id ON tags (memory_id);
CREATE INDEX idx_tags_normalized ON tags (normalized);
CREATE INDEX idx_tags_slug ON tags (slug);

-- Entity searches
CREATE INDEX idx_entities_memory_id ON entities (memory_id);
CREATE INDEX idx_entities_type ON entities (type);
CREATE INDEX idx_entities_text ON entities (text);

-- Action searches
CREATE INDEX idx_actions_memory_id ON actions (memory_id);
CREATE INDEX idx_actions_slug ON actions (slug);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Multi-tenant security (Row Level Security)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (will be enhanced with proper tenant context)
CREATE POLICY memories_tenant_isolation ON memories
    FOR ALL TO PUBLIC
    USING (tenant_id = current_setting('pond.current_tenant_id')::uuid);

-- Cascade RLS to related tables
CREATE POLICY embeddings_tenant_isolation ON embeddings
    FOR ALL TO PUBLIC
    USING (memory_id IN (SELECT id FROM memories WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid));

CREATE POLICY sources_tenant_isolation ON sources
    FOR ALL TO PUBLIC
    USING (memory_id IN (SELECT id FROM memories WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid));

CREATE POLICY tags_tenant_isolation ON tags
    FOR ALL TO PUBLIC
    USING (memory_id IN (SELECT id FROM memories WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid));

CREATE POLICY entities_tenant_isolation ON entities
    FOR ALL TO PUBLIC
    USING (memory_id IN (SELECT id FROM memories WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid));

CREATE POLICY actions_tenant_isolation ON actions
    FOR ALL TO PUBLIC
    USING (memory_id IN (SELECT id FROM memories WHERE tenant_id = current_setting('pond.current_tenant_id')::uuid));