/**
 * Configuration-driven expert system interfaces
 *
 * No more hardcoded expert types! 🎉
 */

/**
 * Expert definition from configuration
 */
export interface ExpertDefinition {
  /** Unique identifier for the expert */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the expert's purpose and domain */
  description: string;

  /** System prompt that defines the expert's personality and role */
  systemPrompt: string;

  /** Keywords for routing decisions */
  keywords: string[];

  /** Whether this expert can evolve over time */
  isEvolutionary: boolean;

  /** Whether this is the default/fallback expert */
  isDefault: boolean;

  /** When this expert was created */
  createdAt: string; // ISO string for JSON compatibility

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Expert configuration file format
 */
export interface ExpertConfig {
  /** Format version for future migrations */
  version: string;

  /** List of expert definitions */
  experts: ExpertDefinition[];

  /** Global evolution settings */
  evolution?: {
    enabled: boolean;
    requiresApproval: boolean;
    cooldownDays: number;
    maxKeywords: number;
  };
}

/**
 * Routing decision from the expert system
 */
export interface RoutingDecision {
  /** ID of the selected expert */
  expertId: string;

  /** Confidence score (0.0 to 1.0) */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Optional secondary experts for cross-domain memories */
  secondaryExperts?: string[];

  /** Routing method used */
  method: "keyword_matching" | "ai_classification" | "embedding_similarity";
}

/**
 * Service interface for managing expert configurations
 */
export interface IExpertConfigService {
  /**
   * Load expert configuration from file
   */
  loadConfig(): Promise<ExpertConfig>;

  /**
   * Get all expert definitions
   */
  getAllExperts(): Promise<ExpertDefinition[]>;

  /**
   * Get expert by ID
   */
  getExpert(id: string): Promise<ExpertDefinition | null>;

  /**
   * Get the default/fallback expert
   */
  getDefaultExpert(): Promise<ExpertDefinition>;

  /**
   * Validate expert configuration
   */
  validateConfig(config: ExpertConfig): Promise<boolean>;

  /**
   * Add a new expert (future evolution feature)
   */
  addExpert(expert: ExpertDefinition): Promise<void>;
}