import {
  assertEquals,
  assertInstanceOf,
  assertLessOrEqual,
  assertMatch,
  assertNotEquals,
  assertThrows,
} from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { Source } from "./source.ts";
import { ValidationError } from "@/domain/shared/errors.ts";
import { SourceType } from "@/domain/shared/types.ts";

// Source Type Business Rules
Deno.test("Source - should reject empty source type", () => {
  assertThrows(
    () => new Source("", "some context"),
    ValidationError,
    "cannot be empty",
  );
});

Deno.test("Source - should accept valid source types", async (t) => {
  const cases = [
    [SourceType.CLAUDE_CODE, "conversation-123"],
    [SourceType.MANUAL, "user input"],
    [SourceType.IMPORT, "/path/to/file.txt"],
    [SourceType.API, "resource-id"],
  ] as const;

  for (const [type, context] of cases) {
    await t.step(String(type), () => {
      const source = new Source(type, context);
      assertEquals(source.type, type);
      assertEquals(source.context, context);
    });
  }
});

// Source Context Business Rules
Deno.test("Source - should require context information", () => {
  assertThrows(
    () => new Source(SourceType.MANUAL, ""),
    ValidationError,
    "context cannot be empty",
  );
});

Deno.test("Source - should trim and validate context", () => {
  assertThrows(
    () => new Source(SourceType.MANUAL, "   \n\t  "),
    ValidationError,
    "context cannot be empty",
  );
});

Deno.test("Source - should limit context length", () => {
  const longContext = "x".repeat(1001);
  assertThrows(
    () => new Source(SourceType.MANUAL, longContext),
    ValidationError,
    "context exceeds maximum",
  );
});

Deno.test("Source - should accept context at maximum length", () => {
  const maxContext = "x".repeat(1000);
  const source = new Source(SourceType.MANUAL, maxContext);
  assertEquals(source.context, maxContext);
});

Deno.test("Source - should reject invalid source types", () => {
  assertThrows(
    () => new Source("invalid-type" as SourceType, "context"),
    ValidationError,
    "Invalid source type",
  );
});

// Source Timestamp Business Rules
Deno.test("Source - should use current time deterministically", () => {
  using _time = new FakeTime(new Date("2023-01-01T00:00:00Z"));
  const source = new Source(SourceType.MANUAL, "test context");

  assertEquals(source.createdAt.toISOString(), "2023-01-01T00:00:00.000Z");
});

Deno.test("Source - should have readonly properties with correct types", () => {
  const source = new Source(SourceType.CLAUDE_CODE, "session-456");

  assertEquals(typeof source.type, "string");
  assertEquals(typeof source.context, "string");
  assertInstanceOf(source.createdAt, Date);
});

Deno.test("Source - should provide defensive copy of createdAt", () => {
  const source = new Source(SourceType.MANUAL, "test context");
  const firstRead = source.createdAt;
  const originalTime = firstRead.getTime();

  // Mutate the returned Date object
  firstRead.setTime(originalTime + 60_000);

  // Fresh read should not reflect the mutation if defensive copy is used
  assertEquals(source.createdAt.getTime(), originalTime);
});

// Source Identification Business Rules
Deno.test("Source - should generate stable hash for deduplication", () => {
  const source1 = new Source(SourceType.MANUAL, "same context");
  const source2 = new Source(SourceType.MANUAL, "same context");
  const source3 = new Source(SourceType.IMPORT, "same context");
  const source4 = new Source(SourceType.MANUAL, "different context");

  // Same type + context should have same hash
  assertEquals(source1.hash, source2.hash);

  // Different type should have different hash
  assertNotEquals(source1.hash, source3.hash);

  // Different context should have different hash
  assertNotEquals(source1.hash, source4.hash);
});

// Source Types Enumeration
Deno.test("Source - should support exactly the expected source types", () => {
  const expected = ["claude-code", "manual", "import", "api"].toSorted();
  const actual = [...Object.values(SourceType)].toSorted();

  assertEquals(actual, expected);
});

// Source Display Business Rules
Deno.test("Source - should provide readable display format", () => {
  const source = new Source(SourceType.CLAUDE_CODE, "session-789");

  const display = source.display();
  assertMatch(display, /claude-code/);
  assertMatch(display, /session-789/);
});

Deno.test("Source - should truncate long context in display", () => {
  const longContext =
    "this is a very long context string that should be truncated for display purposes";
  const source = new Source(SourceType.IMPORT, longContext);

  const display = source.display();
  assertMatch(display, /import:/);
  assertMatch(display, /\.\.\./); // Should contain ellipsis
  assertLessOrEqual(display.length, 70); // Should be reasonably bounded
});
