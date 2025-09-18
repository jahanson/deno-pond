import { getLogger } from "@logtape/logtape";
import {
  RoutingDecision,
  IExpertConfigService,
  ExpertDefinition
} from "@/domain/services/expert-config.interface.ts";

const logger = getLogger("deno-pond.memory-router");

/**
 * Service for routing memories to appropriate experts
 *
 * Now fully configuration-driven - no hardcoded expert types!
 */
export class MemoryRouter {
  constructor(
    private readonly expertConfig: IExpertConfigService
  ) {}

  /**
   * Route memory content to the most appropriate expert
   */
  async routeMemory(content: string, tags: string[] = []): Promise<RoutingDecision> {
    logger.info(`🧭 Routing memory to expert`, {
      contentLength: content.length,
      tagCount: tags.length
    });

    try {
      // Get all available experts from configuration
      const experts = await this.expertConfig.getAllExperts();

      // Use simple keyword-based routing for now
      const routing = await this.performKeywordRouting(content, tags, experts);

      logger.info(`✅ Memory routed to expert`, {
        expertId: routing.expertId,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
        method: routing.method
      });

      return routing;

    } catch (error) {
      logger.warn(`⚠️ Routing failed, using fallback`, {
        error: error instanceof Error ? error.message : String(error)
      });

      // Graceful degradation - fallback to default expert
      const fallbackExpert = await this.expertConfig.getDefaultExpert();
      return {
        expertId: fallbackExpert.id,
        confidence: 0.5,
        reasoning: "Routing failed, using fallback expert",
        method: "keyword_matching"
      };
    }
  }

  /**
   * Perform keyword-based routing using expert configurations
   */
  private async performKeywordRouting(
    content: string,
    tags: string[],
    experts: ExpertDefinition[]
  ): Promise<RoutingDecision> {
    const lowerContent = content.toLowerCase();
    const lowerTags = tags.map(tag => tag.toLowerCase());
    const allSearchText = [lowerContent, ...lowerTags].join(' ');

    let bestMatch: { expert: ExpertDefinition; score: number; matches: string[] } | null = null;

    // Check each expert's keywords
    for (const expert of experts) {
      if (expert.isDefault) continue; // Skip default expert in keyword matching

      const matchedKeywords: string[] = [];
      let totalScore = 0;

      for (const keyword of expert.keywords) {
        const lowerKeyword = keyword.toLowerCase();

        // Check for keyword matches in content and tags
        if (allSearchText.includes(lowerKeyword)) {
          matchedKeywords.push(keyword);

          // Give higher weight to exact word matches vs substring matches
          const exactMatch = new RegExp(`\\b${lowerKeyword}\\b`).test(allSearchText);
          totalScore += exactMatch ? 1.0 : 0.5;
        }
      }

      if (matchedKeywords.length > 0) {
        if (!bestMatch || totalScore > bestMatch.score) {
          bestMatch = { expert, score: totalScore, matches: matchedKeywords };
        }
      }
    }

    // Return best match or fallback to default expert
    if (bestMatch) {
      return {
        expertId: bestMatch.expert.id,
        confidence: Math.min(0.95, 0.6 + (bestMatch.score * 0.1)),
        reasoning: `Matches ${bestMatch.expert.name} keywords: ${bestMatch.matches.join(', ')}`,
        method: "keyword_matching"
      };
    }

    // No keyword matches - use default expert
    const defaultExpert = await this.expertConfig.getDefaultExpert();
    return {
      expertId: defaultExpert.id,
      confidence: 0.5,
      reasoning: "No specific domain keywords found, routing to default expert",
      method: "keyword_matching"
    };
  }

  /**
   * Get routing statistics (for future observability)
   */
  async getRoutingStats(): Promise<Record<string, number>> {
    // TODO: Implement when we have actual routing data
    const stats: Record<string, number> = {};
    const experts = await this.expertConfig.getAllExperts();

    for (const expert of experts) {
      stats[expert.id] = 0;
    }

    return stats;
  }
}