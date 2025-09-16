import {
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { Embedding } from "./embedding.ts";
import { ValidationError } from "@/domain/shared/errors.ts";

// Vector Validation Business Rules
Deno.test("Embedding - should reject empty vector", () => {
  assertThrows(
    () => new Embedding([]),
    ValidationError,
    "cannot be empty",
  );
});

Deno.test("Embedding - should reject vector with invalid dimensions", () => {
  assertThrows(
    () => new Embedding([1, 2]), // too short
    ValidationError,
    "valid dimensions",
  );
});

Deno.test("Embedding - should reject near-miss dimensions", () => {
  const vector513 = new Array(513).fill(0.5); // 513 is not in validDimensions
  assertThrows(
    () => new Embedding(vector513),
    ValidationError,
    "valid dimensions",
  );
});

Deno.test("Embedding - should reject zero vectors", () => {
  const zeroVector = new Array(512).fill(0.0);
  assertThrows(
    () => new Embedding(zeroVector),
    ValidationError,
    "zero vector",
  );
});

Deno.test("Embedding - should reject vector with NaN values", () => {
  const vectorWithNaN = new Array(512).fill(0.5);
  vectorWithNaN[100] = NaN;

  assertThrows(
    () => new Embedding(vectorWithNaN),
    ValidationError,
    "NaN values",
  );
});

Deno.test("Embedding - should reject vector with infinite values", () => {
  const vectorWithInfinity = new Array(512).fill(0.5);
  vectorWithInfinity[200] = Infinity;

  assertThrows(
    () => new Embedding(vectorWithInfinity),
    ValidationError,
    "infinite values",
  );
});

// Embedding Properties Business Rules
Deno.test("Embedding - should accept valid 512-dimensional vector", () => {
  const validVector = new Array(512).fill(0.5);
  const embedding = new Embedding(validVector);

  assertEquals(embedding.vector.length, 512);
  assertEquals(embedding.dimensions, 512);
});

Deno.test("Embedding - should accept valid 768-dimensional vector (Ollama nomic-embed-text)", () => {
  const validVector = new Array(768).fill(0.2);
  const embedding = new Embedding(validVector, "nomic-embed-text");

  assertEquals(embedding.vector.length, 768);
  assertEquals(embedding.dimensions, 768);
  assertEquals(embedding.model, "nomic-embed-text");
});

Deno.test("Embedding - should accept valid 1536-dimensional vector", () => {
  const validVector = new Array(1536).fill(0.1);
  const embedding = new Embedding(validVector);

  assertEquals(embedding.vector.length, 1536);
  assertEquals(embedding.dimensions, 1536);
});

Deno.test("Embedding - should be truly immutable", () => {
  const inputVector = new Array(512).fill(0.0);
  inputVector[0] = 0.1;
  inputVector[1] = 0.2;
  inputVector[2] = 0.3;

  const embedding = new Embedding(inputVector);

  // Mutating input after construction shouldn't affect embedding
  inputVector[0] = 999;
  assertEquals(embedding.vector[0], 0.1);

  // Embedding vector should be frozen/read-only
  assertThrows(
    () => {
      // @ts-ignore - intentionally trying to mutate frozen array
      embedding.vector[0] = 888;
    },
    TypeError,
  );

  // Should be a defensive copy, not same reference
  assertEquals(embedding.vector === inputVector, false);
});

// Vector Operations Business Rules
Deno.test("Embedding - should calculate cosine similarity correctly", () => {
  const vector1 = new Array(512).fill(1.0);
  const vector2 = new Array(512).fill(1.0);
  const vector3 = new Array(512).fill(-1.0);

  const embedding1 = new Embedding(vector1);
  const embedding2 = new Embedding(vector2);
  const embedding3 = new Embedding(vector3);

  // Identical vectors should have similarity of 1 (using proper floating point comparison)
  const similarity1 = embedding1.cosineSimilarity(embedding2);
  assertAlmostEquals(similarity1, 1.0, 1e-9);

  // Opposite vectors should have similarity of -1
  const similarity2 = embedding1.cosineSimilarity(embedding3);
  assertAlmostEquals(similarity2, -1.0, 1e-9);
});

Deno.test("Embedding - should handle orthogonal vectors", () => {
  // Create orthogonal vectors: v1 = [1,0,0,...], v2 = [0,1,0,...]
  const vector1 = new Array(512).fill(0.0);
  const vector2 = new Array(512).fill(0.0);

  vector1[0] = 1.0;
  vector2[1] = 1.0;

  const embedding1 = new Embedding(vector1);
  const embedding2 = new Embedding(vector2);

  // Orthogonal vectors should have similarity of 0
  const similarity = embedding1.cosineSimilarity(embedding2);
  assertAlmostEquals(similarity, 0.0, 1e-9);
});

Deno.test("Embedding - should be scale invariant", () => {
  // Create base vector and scaled version
  const baseVector = new Array(512).fill(0.0);
  baseVector[0] = 1.0;
  baseVector[1] = 2.0;
  baseVector[2] = 3.0;

  const scaledVector = baseVector.map((x) => x * 5.5); // positive scaling

  const embedding1 = new Embedding(baseVector);
  const embedding2 = new Embedding(scaledVector);

  // Scaled vectors should have similarity of 1 (scale invariant)
  const similarity = embedding1.cosineSimilarity(embedding2);
  assertAlmostEquals(similarity, 1.0, 1e-9);
});

Deno.test("Embedding - should enforce cosine similarity bounds", () => {
  // Test various vector combinations to ensure results stay in [-1, 1]
  const testVectors = [
    new Array(512).fill(1.0),
    new Array(512).fill(-1.0),
    Array.from({ length: 512 }, (_, i) => Math.sin(i)),
    Array.from({ length: 512 }, (_, i) => Math.cos(i * 0.1)),
  ];

  for (let i = 0; i < testVectors.length; i++) {
    for (let j = i; j < testVectors.length; j++) {
      const embedding1 = new Embedding(testVectors[i]);
      const embedding2 = new Embedding(testVectors[j]);

      const similarity = embedding1.cosineSimilarity(embedding2);

      // Cosine similarity must be in [-1, 1] with small tolerance for rounding
      assertEquals(
        similarity >= -1 - 1e-12,
        true,
        `Similarity ${similarity} below -1`,
      );
      assertEquals(
        similarity <= 1 + 1e-12,
        true,
        `Similarity ${similarity} above 1`,
      );
    }
  }
});

Deno.test("Embedding - should handle extreme underflow magnitudes", () => {
  // Create vectors with values so small they cause magnitude underflow to 0
  const tinyVector1 = new Array(512).fill(1e-200);
  const tinyVector2 = new Array(512).fill(2e-200);

  const embedding1 = new Embedding(tinyVector1);
  const embedding2 = new Embedding(tinyVector2);

  // When magnitude underflows to 0, should return 0 (documented policy)
  const similarity = embedding1.cosineSimilarity(embedding2);
  assertEquals(similarity, 0);
});

Deno.test("Embedding - should handle small but valid magnitudes", () => {
  // Test that normal small vectors still compute valid cosine
  const smallVector1 = new Array(512).fill(1e-6);
  const smallVector2 = new Array(512).fill(2e-6);

  const embedding1 = new Embedding(smallVector1);
  const embedding2 = new Embedding(smallVector2);

  // Should compute valid cosine similarity, not return 0
  const similarity = embedding1.cosineSimilarity(embedding2);
  assertAlmostEquals(similarity, 1.0, 1e-9); // Same direction = similarity ≈ 1
});

Deno.test("Embedding - should reject extreme edge dimensions", () => {
  // Test 0 and 1 dimension cases if they would otherwise pass validation
  assertThrows(() => new Embedding([]), ValidationError);
  assertThrows(() => new Embedding([1.0]), ValidationError);
});

Deno.test("Embedding - should reject similarity calculation with different dimensions", () => {
  const vector512 = new Array(512).fill(1.0);
  const vector1536 = new Array(1536).fill(1.0);

  const embedding512 = new Embedding(vector512);
  const embedding1536 = new Embedding(vector1536);

  assertThrows(
    () => embedding512.cosineSimilarity(embedding1536),
    ValidationError,
    "different dimensions",
  );
});

// Model Metadata Business Rules
Deno.test("Embedding - should store model information", () => {
  const vector = new Array(512).fill(0.5);
  const embedding = new Embedding(vector, "text-embedding-ada-002");

  assertEquals(embedding.model, "text-embedding-ada-002");
});

Deno.test("Embedding - should default to unknown model", () => {
  const vector = new Array(512).fill(0.5);
  const embedding = new Embedding(vector);

  assertEquals(embedding.model, "unknown");
});
