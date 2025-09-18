import { getLogger } from "@logtape/logtape";
import {
  ExpertConfig,
  ExpertDefinition,
  IExpertConfigService
} from "@/domain/services/expert-config.interface.ts";

const logger = getLogger("deno-pond.expert-config");

/**
 * File-based expert configuration service
 *
 * Loads expert definitions from a JSON configuration file.
 * No more hardcoded expert types!
 */
export class FileExpertConfigService implements IExpertConfigService {
  private configCache?: ExpertConfig;
  private readonly configPath: string;

  constructor(configPath: string = "./config/experts.json") {
    this.configPath = configPath;
  }

  async loadConfig(): Promise<ExpertConfig> {
    if (this.configCache) {
      return this.configCache;
    }

    logger.info(`📋 Loading expert configuration from ${this.configPath}`);

    try {
      const configText = await Deno.readTextFile(this.configPath);
      const config: ExpertConfig = JSON.parse(configText);

      // Validate the configuration
      await this.validateConfig(config);

      this.configCache = config;

      logger.info(`✅ Loaded ${config.experts.length} expert definitions`, {
        experts: config.experts.map(e => e.id),
        version: config.version
      });

      return config;

    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        logger.warn(`⚠️ Expert config file not found at ${this.configPath}, creating default`);
        return await this.createDefaultConfig();
      }

      logger.error(`❌ Failed to load expert configuration: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Expert configuration loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAllExperts(): Promise<ExpertDefinition[]> {
    const config = await this.loadConfig();
    return config.experts;
  }

  async getExpert(id: string): Promise<ExpertDefinition | null> {
    const experts = await this.getAllExperts();
    return experts.find(expert => expert.id === id) || null;
  }

  async getDefaultExpert(): Promise<ExpertDefinition> {
    const experts = await this.getAllExperts();
    const defaultExpert = experts.find(expert => expert.isDefault);

    if (!defaultExpert) {
      throw new Error("No default expert found in configuration");
    }

    return defaultExpert;
  }

  async validateConfig(config: ExpertConfig): Promise<boolean> {
    logger.debug(`🔍 Validating expert configuration`);

    // Check version
    if (!config.version) {
      throw new Error("Expert configuration missing version");
    }

    // Check experts array
    if (!Array.isArray(config.experts) || config.experts.length === 0) {
      throw new Error("Expert configuration must have at least one expert");
    }

    // Validate each expert
    const expertIds = new Set<string>();
    let defaultCount = 0;

    for (const expert of config.experts) {
      // Check required fields
      if (!expert.id || !expert.name || !expert.description) {
        throw new Error(`Expert missing required fields: ${JSON.stringify(expert)}`);
      }

      // Check for duplicate IDs
      if (expertIds.has(expert.id)) {
        throw new Error(`Duplicate expert ID: ${expert.id}`);
      }
      expertIds.add(expert.id);

      // Count default experts
      if (expert.isDefault) {
        defaultCount++;
      }

      // Validate keywords
      if (!Array.isArray(expert.keywords)) {
        throw new Error(`Expert ${expert.id} keywords must be an array`);
      }
    }

    // Exactly one default expert required
    if (defaultCount !== 1) {
      throw new Error(`Must have exactly one default expert, found ${defaultCount}`);
    }

    logger.debug(`✅ Expert configuration validation passed`);
    return true;
  }

  async addExpert(expert: ExpertDefinition): Promise<void> {
    const config = await this.loadConfig();

    // Validate the new expert doesn't conflict
    if (config.experts.some(e => e.id === expert.id)) {
      throw new Error(`Expert with ID ${expert.id} already exists`);
    }

    // Add to configuration
    config.experts.push(expert);

    // Save back to file
    await Deno.writeTextFile(this.configPath, JSON.stringify(config, null, 2));

    // Clear cache to force reload
    this.configCache = undefined;

    logger.info(`✅ Added new expert: ${expert.id}`);
  }

  /**
   * Create default configuration file
   */
  private async createDefaultConfig(): Promise<ExpertConfig> {
    const defaultConfig: ExpertConfig = {
      version: "1.0.0",
      experts: [
        {
          id: "general",
          name: "General Assistant",
          description: "Personal conversations, daily thoughts, general knowledge, and miscellaneous topics",
          systemPrompt: "You are a helpful general assistant who helps with personal conversations, daily thoughts, and general knowledge. You're warm, supportive, and good at general problem-solving.",
          keywords: ["personal", "conversation", "general", "misc", "daily", "thoughts", "help"],
          isEvolutionary: false,
          isDefault: true,
          createdAt: new Date().toISOString(),
          metadata: {
            purpose: "fallback",
            stability: "high"
          }
        },
        {
          id: "deno-pond",
          name: "Deno Pond Expert",
          description: "This specific TypeScript/Deno semantic memory project",
          systemPrompt: "You are an expert in the deno-pond project - a TypeScript/Deno semantic memory system. You understand PostgreSQL integration, Ollama AI pipelines, LogTape logging, and the overall architecture of this semantic memory system.",
          keywords: [
            "deno-pond", "semantic memory", "typescript", "deno", "postgres",
            "ollama", "embedding", "logtape", "pgvector", "claude code",
            "memory service", "embedding service", "nlp pipeline", "ai client",
            "memory of experts", "moe", "routing"
          ],
          isEvolutionary: true,
          isDefault: false,
          createdAt: new Date().toISOString(),
          metadata: {
            purpose: "project-specific",
            stability: "medium"
          }
        }
      ],
      evolution: {
        enabled: true,
        requiresApproval: true,
        cooldownDays: 7,
        maxKeywords: 50
      }
    };

    // Create config directory if it doesn't exist
    try {
      await Deno.mkdir("./config", { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }

    // Write default configuration
    await Deno.writeTextFile(this.configPath, JSON.stringify(defaultConfig, null, 2));

    logger.info(`✅ Created default expert configuration at ${this.configPath}`);

    return defaultConfig;
  }

  /**
   * Clear configuration cache (useful for testing)
   */
  clearCache(): void {
    this.configCache = undefined;
  }
}