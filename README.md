# Pond

**A semantic memory system for AI agents**

Pond stores memories with rich context—content, embeddings, entities, and
actions—then surfaces relevant memories through semantic similarity and
full-text search. Think of it as a brain that remembers not just what you said,
but what it meant.

## Core Concept

When you drop a memory into Pond, it creates ripples. Related memories surface
back—we call this "splashback." The system finds connections you might miss,
bridging conversations across time through meaning rather than keywords.

## Architecture

Built with clean domain-driven design:

- **Domain Layer**: Immutable Memory objects with business logic
- **Infrastructure Layer**: PostgreSQL with pgvector for semantic search
- **Multi-tenant**: Secure isolation using Row Level Security
- **Type-safe**: Strict TypeScript with comprehensive test coverage

## Status

⚠️ **Work in Progress** - This is the Deno/TypeScript rewrite of
[Pond](https://github.com/Embedding-Space/Pond) written in Python. The domain
layer is complete with 66 tests, and the infrastructure layer is designed and
documented, but the system is not yet functional end-to-end.

**What's Done:**

- Domain entities with full business logic
- PostgreSQL schema and repository interfaces
- Multi-tenant architecture design

**What's Next:**

- Ollama integration for embeddings
- Repository implementation completion
- REST API and MCP server

## Development

```bash
# Setup development environment
mise run setup-git-hooks

# Run tests
deno task test

# Type check
deno task check
```

## Philosophy

Memory isn't just storage—it's the foundation of understanding. Pond treats each
memory as a living thing with context, relationships, and meaning. The goal
isn't perfect recall, but thoughtful retrieval of what matters when it matters.

---

_"We are what we remember, and we remember what connects."_
