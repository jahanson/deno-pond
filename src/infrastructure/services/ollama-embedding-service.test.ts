import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { OllamaEmbeddingService } from "./ollama-embedding-service.ts";
import { Embedding } from "@/domain/entities/embedding.ts";

/**
 * Mock fetch for testing Ollama API interactions
 */
class MockFetch {
  public calls: { url: string; options: RequestInit }[] = [];
  private responses: Response[] = [];

  constructor(responses: Response[] = []) {
    this.responses = responses;
  }

  fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    const options = input instanceof Request ? init : init;
    this.calls.push({ url, options: options || {} });
    const response = this.responses.shift();
    if (!response) {
      throw new Error("No mock response available");
    }
    return Promise.resolve(response);
  };

  reset() {
    this.calls = [];
    this.responses = [];
  }

  addResponse(response: Response) {
    this.responses.push(response);
  }
}

/**
 * Create a successful Ollama embedding response
 */
function createSuccessResponse(dimensions: number = 768): Response {
  const embedding = new Array(dimensions).fill(0).map(() => Math.random() - 0.5);
  return new Response(
    JSON.stringify({ embedding }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Create an error response
 */
function createErrorResponse(status: number, message: string): Response {
  return new Response(message, { status });
}

Deno.test("OllamaEmbeddingService - generateEmbedding success", async () => {
  const mockFetch = new MockFetch([createSuccessResponse(768)]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    const embedding = await service.generateEmbedding("Test content for embedding");

    // Verify the API call
    assertEquals(mockFetch.calls.length, 1);
    assertEquals(mockFetch.calls[0].url, "http://test-ollama:11434/api/embeddings");
    assertEquals(mockFetch.calls[0].options.method, "POST");

    // Parse the request body to verify task prefix
    const body = JSON.parse(mockFetch.calls[0].options.body as string);
    assertEquals(body.model, "nomic-embed-text");
    assertEquals(body.prompt, "search_document: Test content for embedding"); // Should have prefix

    // Verify the embedding result
    assertInstanceOf(embedding, Embedding);
    assertEquals(embedding.dimensions, 768);
    assertEquals(embedding.model, "nomic-embed-text");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - generateEmbedding with custom config", async () => {
  const mockFetch = new MockFetch([createSuccessResponse(1024)]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    const embedding = await service.generateEmbedding(
      "Test content",
      { model: "mxbai-embed-large" }
    );

    // Verify custom model was used
    const body = JSON.parse(mockFetch.calls[0].options.body as string);
    assertEquals(body.model, "mxbai-embed-large");

    assertInstanceOf(embedding, Embedding);
    assertEquals(embedding.model, "mxbai-embed-large");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - generateEmbedding API error", async () => {
  const mockFetch = new MockFetch([createErrorResponse(500, "Internal server error")]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    await assertRejects(
      () => service.generateEmbedding("Test content"),
      Error,
      "Ollama API error (500): Internal server error"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - generateEmbedding invalid response", async () => {
  const mockFetch = new MockFetch([
    new Response(JSON.stringify({ invalid: "response" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    await assertRejects(
      () => service.generateEmbedding("Test content"),
      Error,
      "Invalid embedding response from Ollama"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - isHealthy success", async () => {
  const mockFetch = new MockFetch([
    new Response(JSON.stringify({ models: [] }), { status: 200 })
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    const healthy = await service.isHealthy();

    assertEquals(healthy, true);
    assertEquals(mockFetch.calls[0].url, "http://test-ollama:11434/api/tags");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - isHealthy failure", async () => {
  const mockFetch = new MockFetch([createErrorResponse(500, "Server error")]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch.fetch;

  try {
    const service = new OllamaEmbeddingService({
      baseUrl: "http://test-ollama:11434",
      defaultModel: "nomic-embed-text"
    });

    const healthy = await service.isHealthy();

    assertEquals(healthy, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OllamaEmbeddingService - getDefaultConfig", () => {
  const service = new OllamaEmbeddingService({
    baseUrl: "http://test-ollama:11434",
    defaultModel: "nomic-embed-text"
  });

  const config = service.getDefaultConfig();

  assertEquals(config.model, "nomic-embed-text");
  assertEquals(config.dimensions, 768);
});