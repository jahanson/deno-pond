import { ValidationError } from "@/domain/shared/errors.ts";

export class Embedding {
  readonly vector: readonly number[];
  readonly dimensions: number;
  readonly model: string;

  constructor(vector: number[], model: string = "unknown") {
    this.validateVector(vector);
    this.vector = Object.freeze([...vector]); // immutable copy
    this.dimensions = vector.length;
    this.model = model;
  }

  private validateVector(vector: number[]): void {
    if (vector.length === 0) {
      throw new ValidationError("Vector cannot be empty");
    }

    // Common embedding dimensions: 512 (sentence-transformers), 1536 (OpenAI), 768 (BERT), etc.
    const validDimensions = [128, 256, 384, 512, 768, 1024, 1536, 2048, 4096];
    if (!validDimensions.includes(vector.length)) {
      throw new ValidationError("Vector must have valid dimensions");
    }

    // Check for zero vector (undefined cosine similarity)
    const isZeroVector = vector.every((value) => value === 0);
    if (isZeroVector) {
      throw new ValidationError("Vector cannot be zero vector");
    }

    for (let i = 0; i < vector.length; i++) {
      if (isNaN(vector[i])) {
        throw new ValidationError("Vector cannot contain NaN values");
      }
      if (!isFinite(vector[i])) {
        throw new ValidationError("Vector cannot contain infinite values");
      }
    }
  }

  cosineSimilarity(other: Embedding): number {
    if (this.dimensions !== other.dimensions) {
      throw new ValidationError(
        "Cannot compare embeddings with different dimensions",
      );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < this.dimensions; i++) {
      dotProduct += this.vector[i] * other.vector[i];
      normA += this.vector[i] * this.vector[i];
      normB += other.vector[i] * other.vector[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    const similarity = dotProduct / magnitude;
    // Defensive clamping to handle floating-point rounding errors
    return Math.max(-1.0, Math.min(1.0, similarity));
  }
}
