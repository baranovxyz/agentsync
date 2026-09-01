import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import { stringify } from "smol-toml";
import { ConfigError } from "../../core/errors.js";
import type { MCP } from "../../core/mcp/tokens.js";
import { outputFile } from "../../utils/fs.js";
import {
  type CodexOwnership,
  codexConfigPath,
  fileHashState,
  hashValue,
  optionalConfigTable,
  readCodexOwnership,
  readProjectTomlOrEmpty,
  readTomlOrEmpty,
  withoutProperty,
  writeCodexOwnership,
  writeProjectToml,
} from "./shared.js";

function toCodexServer(mcp: MCP): Record<string, unknown> {
  if ("command" in mcp) {
    const server: Record<string, unknown> = {
      command: mcp.command,
      args: mcp.args,
    };
    if (mcp.env && Object.keys(mcp.env).length > 0) {
      server.env = mcp.env;
    }
    return server;
  }
  const server: Record<string, unknown> = { url: mcp.url };
  if (mcp.headers && Object.keys(mcp.headers).length > 0) {
    server.http_headers = mcp.headers;
  }
  return server;
}

function codexHomeMcpEnabled(): boolean {
  return process.env.AGENTSYNC_CODEX_HOME_MCP === "1";
}

function codexHomeConfigPath(): string {
  return path.join(process.env.HOME ?? homedir(), ".codex", "config.toml");
}

function codexMcpServers(mcps: Record<string, MCP>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(mcps).map(([name, mcp]) => [name, toCodexServer(mcp)]),
  );
}

function preservedHomeMcpWarning(name: string, dryRun: boolean): string {
  const action = dryRun
    ? "would preserve it and relinquish AgentSync ownership"
    : "preserved it and relinquished AgentSync ownership";
  return `[codex] home MCP server "${name}" ${action} because it was modified; review or remove it manually`;
}

function configuredHomeMcpCollision(
  homeConfig: string,
  name: string,
  modified: boolean,
): ConfigError {
  return new ConfigError(
    `Refusing to overwrite Codex home MCP server "${name}" in "${homeConfig}": ${
      modified
        ? "the receipt-owned value was modified after the last successful sync"
        : "the occupied key has no prior AgentSync ownership receipt"
    }.`,
    homeConfig,
    "Preserve the existing home MCP server, then rename or remove it if AgentSync should create and own that key; for receipt-owned state, restore the last generated value before retrying.",
  );
}

export async function preflightCodexHomeMcp(
  mcps: Record<string, MCP>,
  cwd: string,
): Promise<void> {
  if (!codexHomeMcpEnabled()) return;
  const homeConfig = codexHomeConfigPath();
  const [receipt, existing] = await Promise.all([
    readCodexOwnership(cwd),
    readTomlOrEmpty(homeConfig),
  ]);
  const existingServers = optionalConfigTable(
    existing,
    "mcp_servers",
    homeConfig,
  );
  for (const name of Object.keys(mcps).sort()) {
    if (!(name in existingServers)) continue;
    const expectedHash = receipt.home_mcp[name];
    if (!expectedHash) {
      throw configuredHomeMcpCollision(homeConfig, name, false);
    }
    if (hashValue(existingServers[name]) !== expectedHash) {
      throw configuredHomeMcpCollision(homeConfig, name, true);
    }
  }
}

function reconcilePriorHomeServers(
  existingServers: Record<string, unknown>,
  desiredServers: Record<string, unknown>,
  ownedHashes: Readonly<Record<string, string>>,
  dryRun: boolean,
): { servers: Record<string, unknown>; warnings: string[] } {
  const servers = { ...existingServers };
  const warnings: string[] = [];
  for (const [name, expectedHash] of Object.entries(ownedHashes).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (name in desiredServers || !(name in existingServers)) continue;
    if (hashValue(existingServers[name]) !== expectedHash) {
      warnings.push(preservedHomeMcpWarning(name, dryRun));
      continue;
    }
    delete servers[name];
  }
  Object.assign(servers, desiredServers);
  return { servers, warnings };
}

export interface CodexHomeMcpResult {
  receipt: CodexOwnership;
  warnings: string[];
  removedFiles: string[];
  modifiedFiles: string[];
}

export async function reconcileCodexHomeMcp(
  mcps: Record<string, MCP>,
  receipt: CodexOwnership,
  dryRun: boolean,
): Promise<CodexHomeMcpResult> {
  if (!codexHomeMcpEnabled()) {
    return {
      receipt,
      warnings: [],
      removedFiles: [],
      modifiedFiles: [],
    };
  }

  const homeConfig = codexHomeConfigPath();
  const state = await fileHashState(homeConfig);
  const existing = await readTomlOrEmpty(homeConfig);
  const existingServers = optionalConfigTable(
    existing,
    "mcp_servers",
    homeConfig,
  );
  const desiredServers = codexMcpServers(mcps);
  const reconciled = reconcilePriorHomeServers(
    existingServers,
    desiredServers,
    receipt.home_mcp,
    dryRun,
  );

  const next =
    Object.keys(reconciled.servers).length > 0
      ? { ...existing, mcp_servers: reconciled.servers }
      : withoutProperty(existing, "mcp_servers");
  const changed = hashValue(next) !== hashValue(existing);
  const removesFile = changed && Object.keys(next).length === 0;
  if (!dryRun && changed) {
    if (removesFile) await rm(homeConfig, { force: true });
    else await outputFile(homeConfig, stringify(next), { encoding: "utf-8" });
  }

  return {
    receipt: {
      ...receipt,
      home_mcp: Object.fromEntries(
        Object.entries(desiredServers).map(([name, server]) => [
          name,
          hashValue(server),
        ]),
      ),
    },
    warnings: reconciled.warnings,
    removedFiles: removesFile && state.kind !== "missing" ? [homeConfig] : [],
    modifiedFiles: changed && !removesFile ? [homeConfig] : [],
  };
}

export async function applyCodexHomeMcp(
  mcps: Record<string, MCP>,
  cwd: string,
  dryRun: boolean,
): Promise<Omit<CodexHomeMcpResult, "receipt">> {
  const result = await reconcileCodexHomeMcp(
    mcps,
    await readCodexOwnership(cwd),
    dryRun,
  );
  if (!dryRun && codexHomeMcpEnabled()) {
    await writeCodexOwnership(cwd, result.receipt);
  }
  return {
    warnings: result.warnings,
    removedFiles: result.removedFiles,
    modifiedFiles: result.modifiedFiles,
  };
}

export async function writeCodexProjectMcp(
  mcps: Record<string, MCP>,
  cwd: string,
): Promise<void> {
  const configFile = codexConfigPath(cwd);
  const existing = await readProjectTomlOrEmpty(cwd, configFile);
  await writeProjectToml(cwd, configFile, {
    ...existing,
    mcp_servers: codexMcpServers(mcps),
  });
}
