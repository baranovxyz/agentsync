import { describe, it, expect, beforeAll } from "vitest";
import { execa } from "execa";
import stripAnsi from "strip-ansi";
import * as path from "path";
import * as fs from "fs-extra";
import * as os from "os";

const cliPath = path.resolve(__dirname, "../../dist/cli.js");

describe("CLI Output Snapshots", () => {
  beforeAll(async () => {
    // Ensure CLI is built
    const exists = await fs.pathExists(cliPath);
    if (!exists) {
      throw new Error(
        `CLI not built. Run 'pnpm build' first. Expected: ${cliPath}`
      );
    }
  });

  describe("Version and Help", () => {
    it("--version output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "--version"]);
      expect(stdout).toMatchInlineSnapshot(`"0.2.0-alpha.3"`);
    });

    it("--help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });
  });

  describe("MCP Commands Help", () => {
    it("mcp --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "mcp", "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });

    it("mcp list --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "mcp", "list", "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });

    it("mcp sync --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "mcp", "sync", "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });

    it("mcp add --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "mcp", "add", "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });

    it("mcp remove --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [
        cliPath,
        "mcp",
        "remove",
        "--help",
      ]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });
  });

  describe("Init Command Help", () => {
    it("init --help output matches snapshot", async () => {
      const { stdout } = await execa("node", [cliPath, "init", "--help"]);
      const clean = stripAnsi(stdout);
      expect(clean).toMatchSnapshot();
    });
  });

  describe("Error Messages", () => {
    it("unknown command error matches snapshot", async () => {
      try {
        await execa("node", [cliPath, "unknown-command"]);
        throw new Error("Should have failed");
      } catch (error: any) {
        const clean = stripAnsi(error.stderr || error.stdout || "");
        expect(clean).toMatchSnapshot();
      }
    });

    it("missing MCP registry error matches snapshot", async () => {
      const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), "snapshot-no-registry-")
      );

      try {
        await execa("node", [cliPath, "mcp", "list"], {
          env: {
            HOME: tempHome,
            USERPROFILE: tempHome, // Windows support
          },
        });
        throw new Error("Should have failed");
      } catch (error: any) {
        const clean = stripAnsi(error.stderr || error.stdout || "");
        expect(clean).toMatchSnapshot();
      } finally {
        await fs.remove(tempHome);
      }
    });

    it("mcp sync without project config error matches snapshot", async () => {
      const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), "snapshot-no-config-")
      );
      const tempProject = await fs.mkdtemp(
        path.join(os.tmpdir(), "snapshot-project-")
      );

      // Create global registry
      const agentsyncDir = path.join(tempHome, ".agentsync");
      await fs.ensureDir(agentsyncDir);
      await fs.writeJson(path.join(agentsyncDir, "mcp.json"), {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "{GITHUB_TOKEN}" },
        },
      });

      try {
        await execa("node", [cliPath, "mcp", "sync"], {
          cwd: tempProject,
          env: {
            HOME: tempHome,
            USERPROFILE: tempHome, // Windows support
          },
        });
        throw new Error("Should have failed");
      } catch (error: any) {
        let clean = stripAnsi(error.stderr || error.stdout || "");
        // Normalize temp directory paths to make snapshot stable
        clean = clean.replace(/\/private\/var\/folders\/[^/]+\/[^/]+\/T\/snapshot-project-[^/]+/g, "/tmp/snapshot-project-XXXXXX");
        clean = clean.replace(/C:\\Users\\[^\\]+\\AppData\\Local\\Temp\\snapshot-project-[^\\]+/g, "C:\\Temp\\snapshot-project-XXXXXX");
        expect(clean).toMatchSnapshot();
      } finally {
        await fs.remove(tempHome);
        await fs.remove(tempProject);
      }
    });

    it("mcp add non-existent server error matches snapshot", async () => {
      const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), "snapshot-no-server-")
      );
      const tempProject = await fs.mkdtemp(
        path.join(os.tmpdir(), "snapshot-project-add-")
      );

      // Create global registry with one server
      const agentsyncDir = path.join(tempHome, ".agentsync");
      await fs.ensureDir(agentsyncDir);
      await fs.writeJson(path.join(agentsyncDir, "mcp.json"), {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      });

      // Create empty project config
      await fs.writeJson(path.join(tempProject, ".agentsync.json"), {
        mcpServers: [],
      });

      try {
        await execa("node", [cliPath, "mcp", "add", "nonexistent-server"], {
          cwd: tempProject,
          env: {
            HOME: tempHome,
            USERPROFILE: tempHome, // Windows support
          },
        });
        throw new Error("Should have failed");
      } catch (error: any) {
        const clean = stripAnsi(error.stderr || error.stdout || "");
        expect(clean).toMatchSnapshot();
      } finally {
        await fs.remove(tempHome);
        await fs.remove(tempProject);
      }
    });
  });
});
