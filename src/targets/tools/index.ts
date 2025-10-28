import type { ToolName } from "../../types/index.js";
import { ClaudeToolConverter } from "./claude-converter.js";
import { ClineToolConverter } from "./cline-converter.js";
import { CursorToolConverter } from "./cursor-converter.js";
import { RooCodeToolConverter } from "./roocode-converter.js";
import type { ToolConverter } from "./types.js";

const ALL_CONVERTERS: Record<ToolName, ToolConverter> = {
  cursor: new CursorToolConverter(),
  claude: new ClaudeToolConverter(),
  cline: new ClineToolConverter(),
  roocode: new RooCodeToolConverter(),
};

export function getConvertersForTools(tools: ToolName[]): ToolConverter[] {
  return tools.map((t) => ALL_CONVERTERS[t]);
}

export function getConverterByName(tool: ToolName): ToolConverter {
  return ALL_CONVERTERS[tool];
}
