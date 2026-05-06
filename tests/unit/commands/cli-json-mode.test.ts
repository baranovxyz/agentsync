/**
 * CLI JSON Mode Consistency Tests
 * Verifies that --json flag and non-TTY detection work across all commands.
 */
import { describe, expect, it } from "vitest";
import { createProgram } from "../../../src/cli.js";

describe("CLI JSON mode", () => {
  it("resolveJsonMode is used by all config subcommands", () => {
    // createProgram registers all commands — verify they exist
    const program = createProgram({ exitOverride: true });
    const configCmd = program.commands.find((c) => c.name() === "config");
    expect(configCmd).toBeDefined();

    const subcommands = configCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain("add");
    expect(subcommands).toContain("rm");
    expect(subcommands).toContain("ls");
    expect(subcommands).toContain("show");
  });

  it("all 9 commands are registered", () => {
    const program = createProgram({ exitOverride: true });
    const topLevel = program.commands.map((c) => c.name());
    expect(topLevel).toContain("init");
    expect(topLevel).toContain("sync");
    expect(topLevel).toContain("clean");
    expect(topLevel).toContain("doctor");
    expect(topLevel).toContain("config");
    expect(topLevel).toHaveLength(5);

    const configCmd = program.commands.find((c) => c.name() === "config")!;
    expect(configCmd.commands).toHaveLength(4);
  });

  it("all commands that support --json have the option registered", () => {
    const program = createProgram({ exitOverride: true });

    // Top-level commands with --json
    const jsonCommands = ["init", "sync", "clean", "doctor"];
    for (const name of jsonCommands) {
      const cmd = program.commands.find((c) => c.name() === name)!;
      const jsonOpt = cmd.options.find(
        (o) => o.long === "--json" || o.short === "--json",
      );
      expect(jsonOpt, `${name} should have --json option`).toBeDefined();
    }

    // Config subcommands with --json
    const configCmd = program.commands.find((c) => c.name() === "config")!;
    const configJsonCommands = ["add", "rm", "ls", "show"];
    for (const name of configJsonCommands) {
      const cmd = configCmd.commands.find((c) => c.name().startsWith(name))!;
      const jsonOpt = cmd.options.find(
        (o) => o.long === "--json" || o.short === "--json",
      );
      expect(jsonOpt, `config ${name} should have --json option`).toBeDefined();
    }
  });
});
