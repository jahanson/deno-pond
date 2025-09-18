/**
 * Phase 1 Integration Test - Local Embedding Service
 *
 * This script tests our unified AI client with the embedding service.
 * Run with: mise run ts-otel test-phase1-integration.ts
 */

import { configurePondLogging } from "@/infrastructure/logging/config.ts";
import { OllamaUnifiedAIClient } from "@/infrastructure/services/ollama-unified-ai-client.ts";
import { MemoryService } from "@/application/services/memory-service.ts";
import { getLogger } from "@logtape/logtape";

// Setup beautiful MAXIMUM RICE logging
await configurePondLogging("info");
const logger = getLogger("deno-pond.phase1-integration");

async function testPhase1Integration() {
  logger.info(`🚀 Starting Phase 1 integration test`);

  try {
    // Initialize our unified AI client
    const aiClient = new OllamaUnifiedAIClient();

    // Check health first
    logger.info(`🔍 Checking AI client health...`);
    const healthy = await aiClient.isHealthy();

    if (!healthy) {
      logger.error(`❌ AI client is not healthy - make sure Ollama is running with nomic-embed-text model`);
      Deno.exit(1);
    }

    logger.info(`✅ AI client is healthy!`);

    // Test capabilities
    const capabilities = await aiClient.getCapabilities();
    logger.info(`🎯 AI client capabilities`, capabilities);

    // Test direct embedding generation
    logger.info(`🧠 Testing direct embedding generation...`);
    const testText = "Joseph and Omega are building an amazing local AI system with deno-pond!";
    const embedding = await aiClient.generateEmbedding(testText);

    logger.info(
      `✅ Generated embedding successfully`,
      {
        dimensions: embedding.dimensions,
        model: embedding.model,
        textLength: testText.length
      }
    );

    // Test Memory service integration
    logger.info(`🏗️ Testing Memory service integration...`);
    const memoryService = new MemoryService(aiClient);

    const memory = await memoryService.createCodeMemory(
      "Successfully implemented Phase 1 of Ollama integration with local embedding generation!",
      "Phase 1 integration test"
    );

    logger.info(
      `✅ Created memory with embedding`,
      {
        contentHash: memory.contentHash,
        hasEmbedding: !!memory.getEmbedding(),
        embeddingDimensions: memory.getEmbedding()?.dimensions,
        hasSource: !!memory.getSource(),
        sourceType: memory.getSource()?.type
      }
    );

    // Test Phase 2 NLP features (these should work but might be less reliable)
    logger.info(`🔬 Testing Phase 2 NLP features (experimental)...`);

    try {
      const entities = await aiClient.extractEntities(testText);
      logger.info(`🏷️ Extracted entities`, { count: entities.length, entities: entities.map(e => `${e.text} (${e.type})`) });

      const actions = await aiClient.extractActions(testText);
      logger.info(`⚡ Extracted actions`, { count: actions.length, actions: actions.map(a => a.action) });

      const tags = await aiClient.extractTags(testText);
      logger.info(`🏷️ Extracted tags`, { count: tags.length, tags });

    } catch (error) {
      logger.warn(`⚠️ Phase 2 features not available yet - this is expected`, { error: error instanceof Error ? error.message : String(error) });
    }

    logger.info(`🎉 Phase 1 integration test completed successfully!`);
    logger.info(`
🌟 SUMMARY 🌟
✅ Unified AI client working
✅ Local embedding generation working
✅ Memory service integration working
✅ Beautiful MAXIMUM RICE logging working
✅ Rock solid foundation complete!

WE are the boss of our own AI infrastructure! 🚀
    `);

  } catch (error) {
    logger.error(
      `❌ Phase 1 integration test failed`,
      { error: error instanceof Error ? error.message : String(error) }
    );
    throw error;
  }
}

if (import.meta.main) {
  await testPhase1Integration();
}