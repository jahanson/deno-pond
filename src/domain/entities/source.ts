import { ValidationError } from "@/domain/shared/errors.ts";
import { SourceType } from "@/domain/shared/types.ts";

export class Source {
  readonly type: SourceType;
  readonly context: string;
  private readonly _createdAt: Date;
  readonly hash: string;

  constructor(type: SourceType | string, context: string) {
    this.validateType(type);
    this.validateContext(context);

    this.type = type as SourceType;
    this.context = context.trim();
    this._createdAt = new Date();
    this.hash = this.generateHash();
  }

  private validateType(type: SourceType | string): void {
    if (!type || type.trim().length === 0) {
      throw new ValidationError("Source type cannot be empty");
    }

    // Validate that the type is a valid SourceType enum value
    const validTypes = Object.values(SourceType);
    if (!validTypes.includes(type as SourceType)) {
      throw new ValidationError("Invalid source type");
    }
  }

  private validateContext(context: string): void {
    const trimmed = context.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("Source context cannot be empty");
    }
    if (context.length > 1000) {
      throw new ValidationError("Source context exceeds maximum length");
    }
  }

  private generateHash(): string {
    const hashInput = `${this.type}:${this.context}`;
    // Simple hash implementation (in production, use crypto.subtle)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  display(): string {
    const maxContextLength = 50;
    const truncatedContext = this.context.length > maxContextLength
      ? this.context.slice(0, maxContextLength) + "..."
      : this.context;

    return `${this.type}: ${truncatedContext}`;
  }
}
