/**
 * Tool Converter/Codec Registry Integration
 * This file provides backward compatibility with the old converter API
 * while using the new codec registry internally
 */

import type { ToolName } from "../../types/index.js";
import { getCodecRegistry } from "../codec-registry.js";
import type { ToolCodec, ToolConverter } from "./types.js";

/**
 * Get converters for multiple tools
 * @deprecated Use getCodecRegistry() directly for new code
 */
export function getConvertersForTools(tools: ToolName[]): ToolConverter[] {
  const registry = getCodecRegistry();
  return tools
    .map((t) => registry.get(t))
    .filter((c): c is ToolCodec => c !== undefined);
}

/**
 * Get converter by tool name
 * @deprecated Use getCodecRegistry().get() directly for new code
 */
export function getConverterByName(tool: ToolName): ToolConverter {
  const registry = getCodecRegistry();
  const codec = registry.get(tool);
  if (!codec) {
    throw new Error(
      `No codec registered for tool: ${tool}. This tool may not be fully implemented yet.`,
    );
  }
  return codec;
}
