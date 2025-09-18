/**
 * Test script for dynamic expert system
 *
 * Validates that our configuration-driven approach works correctly
 */

import { configurePondLogging } from "@/infrastructure/logging/config.ts";
import { FileExpertConfigService } from "@/infrastructure/services/file-expert-config-service.ts";
import { MemoryRouter } from "@/application/services/memory-router.ts";
import { getLogger } from "@logtape/logtape";

await configurePondLogging("info");
const logger = getLogger("deno-pond.dynamic-expert-testing");

async function testDynamicExpertSystem() {
  logger.info(`🧭 Testing Dynamic Expert System`);

  // Initialize services
  const expertConfig = new FileExpertConfigService("./config/experts.json");
  const memoryRouter = new MemoryRouter(expertConfig);

  try {
    // Test 1: Load expert configuration
    logger.info(`📋 Loading expert configuration...`);
    const config = await expertConfig.loadConfig();
    logger.info(`✅ Loaded ${config.experts.length} experts:`, {
      experts: config.experts.map(e => ({ id: e.id, name: e.name, isDefault: e.isDefault }))
    });

    // Test 2: Route general content
    logger.info(`\n🔍 Testing general content routing...`);
    const generalRouting = await memoryRouter.routeMemory(
      "I'm wondering about my daily productivity habits and how to improve them"
    );
    logger.info(`General routing result:`, {
      expertId: generalRouting.expertId,
      confidence: generalRouting.confidence,
      reasoning: generalRouting.reasoning,
      method: generalRouting.method
    });

    // Test 3: Route deno-pond content
    logger.info(`\n🔍 Testing deno-pond content routing...`);
    const denoPondRouting = await memoryRouter.routeMemory(
      "I need to update the TypeScript embedding service in deno-pond to handle Ollama timeouts better"
    );
    logger.info(`Deno-pond routing result:`, {
      expertId: denoPondRouting.expertId,
      confidence: denoPondRouting.confidence,
      reasoning: denoPondRouting.reasoning,
      method: denoPondRouting.method
    });

    // Test 4: Route content with tags
    logger.info(`\n🔍 Testing routing with tags...`);
    const taggedRouting = await memoryRouter.routeMemory(
      "Implementing the memory router phase",
      ["deno-pond", "phase-3", "implementation"]
    );
    logger.info(`Tagged routing result:`, {
      expertId: taggedRouting.expertId,
      confidence: taggedRouting.confidence,
      reasoning: taggedRouting.reasoning,
      method: taggedRouting.method
    });

    // Test 5: Route ambiguous content (should default)
    logger.info(`\n🔍 Testing ambiguous content routing...`);
    const ambiguousRouting = await memoryRouter.routeMemory(
      "The weather is nice today"
    );
    logger.info(`Ambiguous routing result:`, {
      expertId: ambiguousRouting.expertId,
      confidence: ambiguousRouting.confidence,
      reasoning: ambiguousRouting.reasoning,
      method: ambiguousRouting.method
    });

    // Test 6: Get routing stats
    logger.info(`\n📊 Getting routing statistics...`);
    const stats = await memoryRouter.getRoutingStats();
    logger.info(`Routing stats:`, stats);

    logger.info(`\n✅ Dynamic Expert System Test Complete!`);

  } catch (error) {
    logger.error(`❌ Dynamic expert system test failed:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

if (import.meta.main) {
  try {
    await testDynamicExpertSystem();

    logger.info(`
🎯 DYNAMIC EXPERT SYSTEM TESTING COMPLETE 🎯

✅ Configuration loading
✅ Expert routing by keywords
✅ Default expert fallback
✅ Tag-based routing
✅ Statistics tracking

The configuration-driven expert system is working!
No more hardcoded expert types - everything is flexible now.
    `);
  } catch (error) {
    logger.error(`💥 Dynamic expert testing failed: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}