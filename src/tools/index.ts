/**
 * Tool Provider Registry
 * Maps tool names to their provider implementations
 */

import type { ToolName } from "../constants.js";
import { aiderProvider } from "./aider.js";
import { amazonqProvider } from "./amazonq.js";
import { ampProvider } from "./amp.js";
import { augmentProvider } from "./augment.js";
import { claudeProvider } from "./claude.js";
import { clineProvider } from "./cline.js";
import { codexProvider } from "./codex.js";
import { copilotProvider } from "./copilot.js";
import { crushProvider } from "./crush.js";
import { cursorProvider } from "./cursor.js";
import { geminiProvider } from "./gemini.js";
import { gooseProvider } from "./goose.js";
import { junieProvider } from "./junie.js";
import { kilocodeProvider } from "./kilocode.js";
import { kiroProvider } from "./kiro.js";
import { opencodeProvider } from "./opencode.js";
import { openhandsProvider } from "./openhands.js";
import { qwenProvider } from "./qwen.js";
import { roocodeProvider } from "./roocode.js";
import type { ToolProvider } from "./types.js";

const providers: Record<ToolName, ToolProvider> = {
  claude: claudeProvider,
  opencode: opencodeProvider,
  cursor: cursorProvider,
  roocode: roocodeProvider,
  codex: codexProvider,
  copilot: copilotProvider,
  cline: clineProvider,
  gemini: geminiProvider,
  amp: ampProvider,
  goose: gooseProvider,
  aider: aiderProvider,
  amazonq: amazonqProvider,
  augment: augmentProvider,
  kiro: kiroProvider,
  openhands: openhandsProvider,
  junie: junieProvider,
  crush: crushProvider,
  kilocode: kilocodeProvider,
  qwen: qwenProvider,
};

/**
 * Get tool provider by name
 */
export function getToolProvider(name: ToolName): ToolProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return provider;
}

/**
 * Get tool providers for multiple tools
 */
export function getToolProviders(tools: ToolName[]): ToolProvider[] {
  return tools.map(getToolProvider);
}

export type { ToolProvider } from "./types.js";
