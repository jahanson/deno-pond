/**
 * 🌈 MAXIMUM RICE LOGGING CONFIGURATION 🌈
 *
 * The most beautiful logging setup in existence! This configuration brings
 * r/unixporn Hall of Fame aesthetics to our debugging experience.
 *
 * Features:
 * - Hot pink cyberpunk timestamps with Dracula/Nord hybrid colors
 * - Category-specific color coding for visual hierarchy
 * - Custom icons for each log level (🔍💥⚡✨☠️)
 * - Hierarchical structure (deno-pond ▶ database ▶ migration)
 * - Template literal interpolation with syntax highlighting
 *
 * @example
 * ```typescript
 * import { configurePondLogging } from "./config.ts";
 *
 * await configurePondLogging();
 * const logger = getLogger(["deno-pond", "database", "migration"]);
 * logger.info`🚀 Migration starting with MAXIMUM RICE!`;
 * ```
 */

import { configure, getConsoleSink } from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";

/**
 * 🎨 MAXIMUM RICE FORMATTER - Custom theme that makes r/unixporn weep
 *
 * This formatter provides the gorgeous visual hierarchy and cyberpunk aesthetic
 * that transforms debugging from a chore into an art form.
 */
export const riceFormatter = getPrettyFormatter({
  // 🕐 Timestamp with cyberpunk aesthetic
  timestamp: "time",
  timestampColor: "#ff79c6", // Hot pink cyberpunk
  timestampStyle: ["bold", "italic"],

  // 🎨 Custom level colors - Nord/Dracula hybrid perfection
  levelColors: {
    debug: "#8be9fd", // Cyan - for that terminal hacker vibe
    info: "#50fa7b", // Green - matrix code aesthetic
    warning: "#ffb86c", // Orange - warm sunset glow
    error: "#ff5555", // Red - danger zone
    fatal: "#bd93f9", // Purple - galaxy brain
  },
  levelStyle: ["bold", "underline"], // Extra sauce

  // 🏷️ Category styling - hierarchical beauty
  categorySeparator: " ▶ ", // Fancy arrows
  categoryWidth: 30,
  categoryTruncate: "middle",
  categoryColor: "#6272a4", // Cool blue-gray
  categoryStyle: ["bold", "italic"],

  // 🎯 Category-specific colors for maximum visual hierarchy
  categoryColorMap: new Map([
    [["deno-pond", "app"], "#f1fa8c"], // Yellow - main app
    [["deno-pond", "database"], "#8be9fd"], // Cyan - data flows
    [["deno-pond", "migration"], "#ff79c6"], // Pink - schema changes
    [["deno-pond", "memory"], "#50fa7b"], // Green - memory ops
    [["deno-pond", "embedding"], "#bd93f9"], // Purple - AI magic
    [["deno-pond", "repository"], "#ffb86c"], // Orange - persistence
    [["deno-pond", "connection"], "#f8f8f2"], // Off-white - connectivity
  ]),

  // 💬 Message styling
  messageColor: "#f8f8f2", // Off-white for readability

  // ✨ Icons for that extra visual flair
  icons: {
    debug: "🔍",
    info: "✨",
    warning: "⚡",
    error: "💥",
    fatal: "☠️",
  },
});

/**
 * 🚀 Configure LogTape with MAXIMUM RICE for the entire deno-pond application
 *
 * This function sets up the beautiful logging configuration that makes debugging
 * a joy. Call this once at application startup to enable gorgeous logs throughout
 * the entire codebase.
 *
 * @param lowestLevel - Minimum log level to capture (default: "debug" for full rice)
 */
export async function configurePondLogging(
  lowestLevel: "debug" | "info" | "warning" | "error" | "fatal" = "debug",
): Promise<void> {
  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: riceFormatter,
      }),
    },
    loggers: [
      // Capture everything from deno-pond with our beautiful formatting
      { category: ["deno-pond"], lowestLevel, sinks: ["console"] },

      // Also capture root level logs at info+ to avoid spam but keep important stuff
      { category: [], lowestLevel: "info", sinks: ["console"] },
    ],
  });
}

/**
 * 🎭 EPIC ASCII ART HEADERS for maximum visual impact
 *
 * Use these in your modules to create stunning visual separation and
 * establish that this is serious RICE TERRITORY.
 */
export const ASCII_HEADERS = {
  POND_LOGO: `
╔══════════════════════════════════════════════════════════════════════════════╗
║  🌈  ██████╗ ███████╗███╗   ██╗ ██████╗       ██████╗  ██████╗ ███╗   ██╗██████╗   ║
║     ██╔══██╗██╔════╝████╗  ██║██╔═══██╗      ██╔══██╗██╔═══██╗████╗  ██║██╔══██╗  ║
║     ██║  ██║█████╗  ██╔██╗ ██║██║   ██║█████╗██████╔╝██║   ██║██╔██╗ ██║██║  ██║  ║
║     ██║  ██║██╔══╝  ██║╚██╗██║██║   ██║╚════╝██╔═══╝ ██║   ██║██║╚██╗██║██║  ██║  ║
║     ██████╔╝███████╗██║ ╚████║╚██████╔╝      ██║     ╚██████╔╝██║ ╚████║██████╔╝  ║
║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝       ╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚═════╝   ║
╚══════════════════════════════════════════════════════════════════════════════╝`,

  RICE_ACTIVATED: `
╔════════════════════════════════════════════════════════════════════════════╗
║                          🌟 RICE LEVEL: MAXIMUM 🌟                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║  ✨ Beautiful hierarchical categories (deno-pond ▶ database ▶ migration)  ║
║  🎨 Custom Dracula/Nord color scheme with category-specific colors         ║
║  🎯 Custom icons for each log level (🔍 💥 ⚡ ✨ ☠️)                      ║
║  📊 Structured data logging with perfect formatting                        ║
║  🔤 Template literal interpolation with syntax highlighting                ║
║  ⚡ Zero dependencies, TypeScript native, pure performance                 ║
║  🐛 PERFECT for debugging database migrations with STYLE!                  ║
╚════════════════════════════════════════════════════════════════════════════╝`,

  STARTUP: `
    🔥 MAXIMUM RICE MODE ACTIVATED 🔥
    💻 Aesthetic Level: r/unixporn Hall of Fame 💻
    🏆 This logging setup would make r/unixporn WEEP with joy! 🏆
    💫 Ready to debug in MAXIMUM AESTHETIC! 💫`,
} as const;

/**
 * 🎪 Utility function to display epic startup banner
 * Call this when your module initializes to announce MAXIMUM RICE activation
 */
export function displayStartupBanner(moduleName: string): void {
  console.log(ASCII_HEADERS.POND_LOGO);
  console.log(ASCII_HEADERS.STARTUP);
  console.log(
    `\n    🚀 ${moduleName} MODULE INITIALIZED WITH MAXIMUM RICE! 🚀\n`,
  );
}

/**
 * 🎆 Utility function to display rice level achievement
 * Call this when operations complete successfully for maximum satisfaction
 */
export function displayRiceAchievement(): void {
  console.log(`\n${ASCII_HEADERS.RICE_ACTIVATED}\n`);
}
