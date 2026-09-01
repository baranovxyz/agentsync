import { describe, expect, it } from "vitest";
import { SUPPORTED_TOOLS } from "../../../src/constants.js";
import { getToolProvider } from "../../../src/tools/index.js";
import type { ToolProvider } from "../../../src/tools/types.js";

/**
 * Tools whose coverage of the GLOBAL `~/.agents/` scope has actually been
 * checked against the vendor's source or docs.
 */
const GLOBAL_AGENTS_DIR_VERIFIED_TRUE: readonly string[] = [
  "codex",
  "cursor",
  "droid",
  "opencode",
  "pi",
  "vibe",
];

function expectRequiredMethod(
  owner: object | null | undefined,
  method: unknown,
): void {
  if (owner) expect(method).toBeTypeOf("function");
}

type ManifestSurface = ToolProvider["manifestCleanSurfaces"][number];

function isGeneratedOutputPath(
  relativePath: string | null | undefined,
): relativePath is string {
  if (!relativePath) return false;
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  return !(
    normalized === "agents.md" ||
    normalized === ".agents" ||
    normalized.startsWith(".agents/")
  );
}

/**
 * Derive generic file-receipt surfaces from the writers independently of the
 * declaration under test. Provider-private agent bundles (currently Codex)
 * are excluded because their hook owns the Markdown, companion file, and
 * structured entry as one semantic receipt.
 */
function expectedManifestSurfaces(provider: ToolProvider): ManifestSurface[] {
  const skillRoot = provider.capabilities.nativeSkillsDiscovery
    ? provider.paths.generatedPresetSkillsDir
    : provider.paths.skillsDir;
  const privateAgentBundle = Boolean(
    provider.agentsPostHook &&
      provider.hasGeneratedState &&
      provider.cleanGeneratedState,
  );
  return [
    provider.capabilities.skills && isGeneratedOutputPath(skillRoot)
      ? "skills"
      : null,
    provider.capabilities.commands &&
    isGeneratedOutputPath(provider.paths.commandsDir)
      ? "commands"
      : null,
    provider.capabilities.agents &&
    !privateAgentBundle &&
    isGeneratedOutputPath(provider.paths.agentsDir)
      ? "agents"
      : null,
    provider.docsFormat && isGeneratedOutputPath(provider.paths.docsFile)
      ? "docs"
      : null,
    provider.capabilities.rules &&
    isGeneratedOutputPath(provider.rulesFormat?.fileOutput?.root)
      ? "rules"
      : null,
    (provider.extensionFileOutputs?.length ?? 0) > 0 ? "extension-files" : null,
  ].filter((surface): surface is ManifestSurface => surface !== null);
}

describe("ToolProvider interface", () => {
  for (const tool of SUPPORTED_TOOLS) {
    it(`${tool} has capabilities object`, () => {
      const p = getToolProvider(tool);
      expect(p.capabilities).toBeDefined();
      expect(typeof p.capabilities.skills).toBe("boolean");
      expect(typeof p.capabilities.commands).toBe("boolean");
      expect(typeof p.capabilities.agents).toBe("boolean");
      expect(typeof p.capabilities.mcpStdio).toBe("boolean");
      expect(typeof p.capabilities.mcpHttp).toBe("boolean");
      expect(typeof p.capabilities.nativeAgentsMd).toBe("boolean");
      expect(typeof p.capabilities.nativeSkillsDiscovery).toBe("boolean");
    });

    it(`${tool} declares global native-skill coverage explicitly`, () => {
      const p = getToolProvider(tool);
      if (GLOBAL_AGENTS_DIR_VERIFIED_TRUE.includes(tool)) {
        expect(p.readsGlobalAgentsDir).toBe(true);
      } else if (p.capabilities.nativeSkillsDiscovery) {
        expect(p.readsGlobalAgentsDir).toBe("unverified");
      } else {
        expect(p.readsGlobalAgentsDir).toBe(false);
      }
    });

    it(`${tool} has agentFileExtension string`, () => {
      const p = getToolProvider(tool);
      expect(typeof p.agentFileExtension).toBe("string");
      expect([".md", ".agent.md"]).toContain(p.agentFileExtension);
    });

    it(`${tool} declares every generic generated file surface`, () => {
      const provider = getToolProvider(tool);
      expect(new Set(provider.manifestCleanSurfaces).size).toBe(
        provider.manifestCleanSurfaces.length,
      );
      expect(provider.manifestCleanSurfaces).toEqual(
        expectedManifestSurfaces(provider),
      );
    });

    it(`${tool} exposes complete preview and validation contracts`, () => {
      const p = getToolProvider(tool);
      expectRequiredMethod(p.rulesFormat, p.rulesFormat?.previewRules);
      expectRequiredMethod(p.hooksFormat, p.hooksFormat?.previewHooks);
      expectRequiredMethod(
        p.permissionsFormat,
        p.permissionsFormat?.previewPermissions,
      );
      expectRequiredMethod(
        p.statuslineFormat,
        p.statuslineFormat?.previewStatusline,
      );
      expectRequiredMethod(
        p.outputStyleFormat,
        p.outputStyleFormat?.previewOutputStyle,
      );
      expectRequiredMethod(p.agentsPostHook, p.agentsPostHook?.validate);
      expectRequiredMethod(p.agentsPostHook, p.agentsPostHook?.preflight);
      expectRequiredMethod(
        p.extensionsReconciler,
        p.extensionsReconciler?.preflight,
      );
    });
  }
});
