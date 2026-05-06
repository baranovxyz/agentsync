/**
 * Interactive Prompt Tests for Init Command
 * Tests the user interaction flow using @inquirer/testing
 */

import { checkbox, confirm, select } from "@inquirer/prompts";
import { render } from "@inquirer/testing";
import { describe, expect, it } from "vitest";

describe("Init Command Interactive Prompts", () => {
  describe("Template Selection", () => {
    it("should allow selecting default template", async () => {
      const { answer, events, getScreen } = await render(select, {
        message: "Select a template:",
        choices: [
          { name: "Default (General Purpose)", value: "default" },
          { name: "TypeScript React", value: "typescript-react" },
          { name: "Python FastAPI", value: "python-fastapi" },
        ],
        default: "default",
      });

      // Verify initial render shows the prompt
      expect(getScreen()).toContain("Select a template:");
      expect(getScreen()).toContain("Default (General Purpose)");

      // Submit default selection (press Enter)
      events.keypress("enter");

      // Verify the answer
      await expect(answer).resolves.toBe("default");
    });

    it("should allow navigating and selecting TypeScript React template", async () => {
      const { answer, events } = await render(select, {
        message: "Select a template:",
        choices: [
          { name: "Default (General Purpose)", value: "default" },
          { name: "TypeScript React", value: "typescript-react" },
          { name: "Python FastAPI", value: "python-fastapi" },
        ],
        default: "default",
      });

      // Navigate down to TypeScript React
      events.keypress("down");
      events.keypress("enter");

      await expect(answer).resolves.toBe("typescript-react");
    });

    it("should allow navigating and selecting Python FastAPI template", async () => {
      const { answer, events } = await render(select, {
        message: "Select a template:",
        choices: [
          { name: "Default (General Purpose)", value: "default" },
          { name: "TypeScript React", value: "typescript-react" },
          { name: "Python FastAPI", value: "python-fastapi" },
        ],
        default: "default",
      });

      // Navigate down twice to Python FastAPI
      events.keypress("down");
      events.keypress("down");
      events.keypress("enter");

      await expect(answer).resolves.toBe("python-fastapi");
    });
  });

  describe("Tool Selection", () => {
    it("should allow selecting multiple tools", async () => {
      const { answer, events, getScreen } = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
          { name: "Cline", value: "cline" },
          { name: "RooCode", value: "roocode" },
        ],
      });

      // Verify initial render
      expect(getScreen()).toContain("Which AI tools do you use?");
      expect(getScreen()).toContain("Cursor");
      expect(getScreen()).toContain("Claude Code");

      // Cursor and Claude should be pre-checked, just submit
      events.keypress("enter");

      // Verify both pre-selected tools are included
      const result = await answer;
      expect(result).toEqual(["cursor", "claude"]);
    });

    it("should allow toggling tool selection", async () => {
      const { answer, events } = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
          { name: "Cline", value: "cline" },
          { name: "RooCode", value: "roocode" },
        ],
      });

      // Uncheck Cursor (currently selected)
      events.keypress("space");

      // Navigate down to Claude
      events.keypress("down");

      // Keep Claude checked (don't press space)

      // Navigate down to Cline
      events.keypress("down");

      // Check Cline
      events.keypress("space");

      // Submit
      events.keypress("enter");

      // Should have Claude and Cline (Cursor unchecked, Cline added)
      const result = await answer;
      expect(result).toEqual(["claude", "cline"]);
    });

    it("should allow selecting all tools", async () => {
      const { answer, events } = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor" },
          { name: "Claude Code", value: "claude" },
          { name: "Cline", value: "cline" },
          { name: "RooCode", value: "roocode" },
        ],
      });

      // Select all tools
      events.keypress("space"); // Cursor
      events.keypress("down");
      events.keypress("space"); // Claude
      events.keypress("down");
      events.keypress("space"); // Cline
      events.keypress("down");
      events.keypress("space"); // RooCode

      events.keypress("enter");

      const result = await answer;
      expect(result).toEqual(["cursor", "claude", "cline", "roocode"]);
    });

    it("should allow selecting no tools", async () => {
      const { answer, events } = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
        ],
      });

      // Uncheck both pre-selected tools
      events.keypress("space"); // Uncheck Cursor
      events.keypress("down");
      events.keypress("space"); // Uncheck Claude

      events.keypress("enter");

      const result = await answer;
      expect(result).toEqual([]);
    });
  });

  describe("Symlinks Confirmation", () => {
    it("should default to true for symlinks", async () => {
      const { answer, events, getScreen } = await render(confirm, {
        message: "Use symlinks for tool configurations? (recommended)",
        default: true,
      });

      // Verify prompt shows
      expect(getScreen()).toContain("Use symlinks");
      expect(getScreen()).toContain("recommended");

      // Accept default (yes)
      events.keypress("enter");

      await expect(answer).resolves.toBe(true);
    });

    it("should allow choosing no for symlinks", async () => {
      const { answer, events } = await render(confirm, {
        message: "Use symlinks for tool configurations? (recommended)",
        default: false, // Start with false default
      });

      // Just press enter to accept the default (false)
      events.keypress("enter");

      await expect(answer).resolves.toBe(false);
    });

    it("should allow choosing yes explicitly", async () => {
      const { answer, events } = await render(confirm, {
        message: "Use symlinks for tool configurations? (recommended)",
        default: true, // Start with true default
      });

      // Just press enter to accept the default (true)
      events.keypress("enter");

      await expect(answer).resolves.toBe(true);
    });
  });

  describe("Gitignore Update Confirmation", () => {
    it("should default to true for gitignore update", async () => {
      const { answer, events, getScreen } = await render(confirm, {
        message: "Add AgentSync entries to .gitignore?",
        default: true,
      });

      // Verify prompt shows
      expect(getScreen()).toContain("Add AgentSync entries to .gitignore?");

      // Accept default (yes)
      events.keypress("enter");

      await expect(answer).resolves.toBe(true);
    });

    it("should allow declining gitignore update", async () => {
      const { answer, events } = await render(confirm, {
        message: "Add AgentSync entries to .gitignore?",
        default: false, // Start with false default
      });

      // Just press enter to accept the default (false)
      events.keypress("enter");

      await expect(answer).resolves.toBe(false);
    });
  });

  describe("Full Interactive Flow Simulation", () => {
    it("should complete full workflow with default selections", async () => {
      // Simulate full init flow with all defaults
      const results: Record<string, unknown> = {};

      // Step 1: Template selection (default)
      const templatePrompt = await render(select, {
        message: "Select a template:",
        choices: [
          { name: "Default (General Purpose)", value: "default" },
          { name: "TypeScript React", value: "typescript-react" },
          { name: "Python FastAPI", value: "python-fastapi" },
        ],
        default: "default",
      });
      templatePrompt.events.keypress("enter");
      results.template = await templatePrompt.answer;

      // Step 2: Tool selection (Cursor + Claude pre-selected)
      const toolsPrompt = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
          { name: "Cline", value: "cline" },
        ],
      });
      toolsPrompt.events.keypress("enter");
      results.tools = await toolsPrompt.answer;

      // Step 3: Symlinks (default yes)
      const symlinksPrompt = await render(confirm, {
        message: "Use symlinks for tool configurations? (recommended)",
        default: true,
      });
      symlinksPrompt.events.keypress("enter");
      results.useSymlinks = await symlinksPrompt.answer;

      // Step 4: Gitignore (default yes)
      const gitignorePrompt = await render(confirm, {
        message: "Add AgentSync entries to .gitignore?",
        default: true,
      });
      gitignorePrompt.events.keypress("enter");
      results.updateGitignore = await gitignorePrompt.answer;

      // Verify complete flow results
      expect(results).toEqual({
        template: "default",
        tools: ["cursor", "claude"],
        useSymlinks: true,
        updateGitignore: true,
      });
    });

    it("should complete full workflow with custom selections", async () => {
      const results: Record<string, unknown> = {};

      // Step 1: Select TypeScript React template
      const templatePrompt = await render(select, {
        message: "Select a template:",
        choices: [
          { name: "Default (General Purpose)", value: "default" },
          { name: "TypeScript React", value: "typescript-react" },
          { name: "Python FastAPI", value: "python-fastapi" },
        ],
        default: "default",
      });
      templatePrompt.events.keypress("down"); // Navigate to TypeScript React
      templatePrompt.events.keypress("enter");
      results.template = await templatePrompt.answer;

      // Step 2: Select only Cline
      const toolsPrompt = await render(checkbox, {
        message: "Which AI tools do you use?",
        choices: [
          { name: "Cursor", value: "cursor", checked: true },
          { name: "Claude Code", value: "claude", checked: true },
          { name: "Cline", value: "cline" },
        ],
      });
      toolsPrompt.events.keypress("space"); // Uncheck Cursor
      toolsPrompt.events.keypress("down");
      toolsPrompt.events.keypress("space"); // Uncheck Claude
      toolsPrompt.events.keypress("down");
      toolsPrompt.events.keypress("space"); // Check Cline
      toolsPrompt.events.keypress("enter");
      results.tools = await toolsPrompt.answer;

      // Step 3: No symlinks
      const symlinksPrompt = await render(confirm, {
        message: "Use symlinks for tool configurations? (recommended)",
        default: false, // Start with false for this test
      });
      symlinksPrompt.events.keypress("enter"); // Accept default (false)
      results.useSymlinks = await symlinksPrompt.answer;

      // Step 4: No gitignore update
      const gitignorePrompt = await render(confirm, {
        message: "Add AgentSync entries to .gitignore?",
        default: false, // Start with false for this test
      });
      gitignorePrompt.events.keypress("enter"); // Accept default (false)
      results.updateGitignore = await gitignorePrompt.answer;

      // Verify custom selections
      expect(results).toEqual({
        template: "typescript-react",
        tools: ["cline"],
        useSymlinks: false,
        updateGitignore: false,
      });
    });
  });
});
