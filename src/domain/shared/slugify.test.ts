import { assertEquals } from "jsr:@std/assert";
import { slugify } from "./slugify.ts";

// Basic ASCII functionality
Deno.test("slugify - should handle basic ASCII text", () => {
  assertEquals(slugify("Hello World"), "hello-world");
  assertEquals(slugify("TypeScript Patterns"), "typescript-patterns");
});

Deno.test("slugify - should normalize whitespace and separators", () => {
  assertEquals(slugify("  multiple   spaces  "), "multiple-spaces");
  assertEquals(slugify("under_scores_and-hyphens"), "under-scores-and-hyphens");
  assertEquals(slugify("mixed___---separators"), "mixed-separators");
});

Deno.test("slugify - should remove special characters", () => {
  assertEquals(
    slugify("Domain-Driven Design (DDD)!"),
    "domain-driven-design-ddd",
  );
  assertEquals(slugify("@#$%^&*()+={}[]|\\:;\"'<>,.?/"), "");
  assertEquals(slugify("API v2.1 & Testing!"), "api-v21-testing");
});

Deno.test("slugify - should trim edge separators", () => {
  assertEquals(slugify("-leading-hyphens-"), "leading-hyphens");
  assertEquals(slugify("___trailing_underscores___"), "trailing-underscores");
  assertEquals(
    slugify("--multiple--edge--separators--"),
    "multiple-edge-separators",
  );
});

// Unicode and accent handling
Deno.test("slugify - should strip accents and diacritics", () => {
  assertEquals(slugify("Café"), "cafe");
  assertEquals(slugify("Münchën"), "munchen");
  assertEquals(slugify("Résumé"), "resume");
  assertEquals(slugify("naïve"), "naive");
  assertEquals(slugify("Señor"), "senor");
  assertEquals(slugify("François"), "francois");
});

Deno.test("slugify - should handle various Unicode scripts", () => {
  // Latin extended - some chars don't normalize to ASCII
  assertEquals(slugify("Åse Øyvind"), "ase-øyvind"); // Ø doesn't normalize
  assertEquals(slugify("Łódź"), "łodz"); // Some Polish chars normalize

  // Cyrillic (should preserve letters)
  assertEquals(slugify("Привет Мир"), "привет-мир");

  // Greek (should preserve letters)
  assertEquals(slugify("Αθήνα"), "αθηνα");

  // Mixed scripts
  assertEquals(slugify("北京 Beijing"), "北京-beijing");
});

Deno.test("slugify - should handle emoji and symbols", () => {
  assertEquals(slugify("React ⚛️ Components"), "react-components");
  assertEquals(slugify("Coffee ☕ & Code 💻"), "coffee-code");
  assertEquals(slugify("🚀 Deployment"), "deployment");
});

Deno.test("slugify - should handle numbers correctly", () => {
  assertEquals(slugify("Version 2.1.3"), "version-213");
  assertEquals(slugify("HTTP/2 Protocol"), "http2-protocol");
  assertEquals(slugify("Year 2024"), "year-2024");
});

// Locale-specific tests
Deno.test("slugify - should handle Turkish locale correctly", () => {
  // Turkish has special İ/ı casing rules - actual results
  assertEquals(slugify("İstanbul", "tr"), "istanbul");
  assertEquals(slugify("ISTANBUL", "tr"), "ıstanbul"); // Turkish ı character
});

Deno.test("slugify - should default to standard casing without locale", () => {
  assertEquals(slugify("İSTANBUL"), "istanbul");
  assertEquals(slugify("BERLIN"), "berlin");
});

// Edge cases
Deno.test("slugify - should handle empty and whitespace-only strings", () => {
  assertEquals(slugify(""), "");
  assertEquals(slugify("   "), "");
  assertEquals(slugify("\t\n\r"), "");
});

Deno.test("slugify - should handle single characters", () => {
  assertEquals(slugify("A"), "a");
  assertEquals(slugify("é"), "e");
  assertEquals(slugify("1"), "1");
  assertEquals(slugify("!"), "");
});

Deno.test("slugify - should handle very long strings", () => {
  const longText =
    "This is a very long string with many words that should be properly slugified"
      .repeat(5);
  const result = slugify(longText);

  // Should not throw and should be properly formatted
  assertEquals(result.includes("--"), false); // No double hyphens
  assertEquals(result.startsWith("-"), false); // No leading hyphen
  assertEquals(result.endsWith("-"), false); // No trailing hyphen
});

// Real-world examples
Deno.test("slugify - should handle real-world examples", () => {
  assertEquals(slugify("Memory-of-Experts (MoE)"), "memory-of-experts-moe");
  assertEquals(slugify("Pond's Deep Dive Feature"), "ponds-deep-dive-feature");
  assertEquals(slugify("TypeScript & Deno Project"), "typescript-deno-project");
  assertEquals(slugify("API v1.0 – Authentication"), "api-v10-authentication");
  assertEquals(slugify("User's Guide (français)"), "users-guide-francais");
});
