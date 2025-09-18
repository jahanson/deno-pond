/**
 * Ollama Edge Case Testing
 *
 * Tests what happens when things go wrong with our AI infrastructure.
 * Because Murphy's Law applies to AI services too!
 */

import { configurePondLogging } from "@/infrastructure/logging/config.ts";
import { OllamaUnifiedAIClient } from "@/infrastructure/services/ollama-unified-ai-client.ts";
import { MemoryService } from "@/application/services/memory-service.ts";
import { getLogger } from "@logtape/logtape";

await configurePondLogging("info");
const logger = getLogger("deno-pond.edge-case-testing");

async function testOllamaDowntime() {
  logger.info(`🔥 Testing Ollama downtime scenarios`);

  // Test with unreachable endpoint
  const unreachableClient = new OllamaUnifiedAIClient({
    baseUrl: "http://192.168.99.99:11434", // Non-existent IP
    timeoutMs: 5000 // Shorter timeout for faster tests
  });

  try {
    logger.info(`🔍 Testing health check with unreachable server...`);
    const healthy = await unreachableClient.isHealthy();
    logger.info(`Health check result: ${healthy ? "✅ Healthy" : "❌ Unhealthy"}`);

    logger.info(`🧠 Testing embedding generation with unreachable server...`);
    const embedding = await unreachableClient.generateEmbedding("This should fail gracefully");
    logger.error(`❌ This shouldn't have worked! Got embedding: ${embedding.dimensions}`);
  } catch (error) {
    logger.info(`✅ Embedding generation failed gracefully: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    logger.info(`🏷️ Testing entity extraction with unreachable server...`);
    const entities = await unreachableClient.extractEntities("Joseph and Omega are testing edge cases");
    logger.info(`Entity extraction result: ${entities.length} entities (should be 0 for graceful degradation)`);
  } catch (error) {
    logger.info(`✅ Entity extraction failed gracefully: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test MemoryService with unreachable AI
  try {
    logger.info(`📝 Testing Memory service with unreachable AI...`);
    const memoryService = new MemoryService(unreachableClient);
    const memory = await memoryService.createUserMemory("This memory creation should handle AI failure gracefully");
    logger.info(`Memory created: has embedding = ${!!memory.getEmbedding()}`);
  } catch (error) {
    logger.info(`Memory service error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testPartialFailures() {
  logger.info(`⚡ Testing partial failure scenarios`);

  // Test with real embedding endpoint but fake NLP models
  const partialClient = new OllamaUnifiedAIClient({
    baseUrl: "http://10.1.1.71:11434", // Your real Ollama
    nlpModel: "nonexistent-model:latest",
    reasoningModel: "another-fake-model:latest"
  });

  try {
    logger.info(`🧠 Testing embedding with real endpoint...`);
    const embedding = await partialClient.generateEmbedding("This should work");
    logger.info(`✅ Embedding successful: ${embedding.dimensions} dimensions`);

    logger.info(`🏷️ Testing entity extraction with fake model...`);
    const entities = await partialClient.extractEntities("Joseph and Omega are testing failures");
    logger.info(`Entity extraction result: ${entities.length} entities`);
  } catch (error) {
    logger.info(`Entity extraction error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testMalformedResponses() {
  logger.info(`🤖 Testing malformed AI responses`);

  // We can't easily mock this without more infrastructure, but we can test edge cases
  const client = new OllamaUnifiedAIClient({
    baseUrl: "http://10.1.1.71:11434"
  });

  try {
    logger.info(`🧪 Testing with edge case text...`);

    // Test with empty text
    const emptyEntities = await client.extractEntities("");
    logger.info(`Empty text entities: ${emptyEntities.length}`);

    // Test with very long text
    const longText = "The".repeat(1000) + " Joseph and Omega are building something amazing!";
    const longEntities = await client.extractEntities(longText);
    logger.info(`Long text entities: ${longEntities.length}`);

    // Test with special characters
    const specialText = "🚀 Joseph & Omega are using AI! @#$%^&*()[]{}|\\:;\"'<>,.?/~`";
    const specialEntities = await client.extractEntities(specialText);
    logger.info(`Special character entities: ${specialEntities.length}`);

    // Test with multilingual text (even though we said English only)
    const multiText = "Joseph et Omega construisent quelque chose d'incroyable! José y Omega están construyendo algo increíble!";
    const multiEntities = await client.extractEntities(multiText);
    logger.info(`Multilingual entities: ${multiEntities.length}`);

  } catch (error) {
    logger.warn(`Edge case testing error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (import.meta.main) {
  try {
    await testOllamaDowntime();
    logger.info(`\n${"=".repeat(50)}\n`);
    await testPartialFailures();
    logger.info(`\n${"=".repeat(50)}\n`);
    await testMalformedResponses();

    logger.info(`
🎯 EDGE CASE TESTING COMPLETE 🎯
Check the logs above to verify:
- Graceful degradation when Ollama is down
- Proper error handling for missing models
- Resilience with edge case inputs
- User experience during failures
    `);
  } catch (error) {
    logger.error(`💥 Edge case testing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}