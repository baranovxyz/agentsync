/**
 * Tests for user-friendly error messages
 */

import { describe, expect, it } from "vitest";
import {
  ErrorHandler,
  ErrorSeverity,
  InteractiveSelectionError,
  SelectionValidationError,
  SelectiveLoadingError,
  SourceResolutionError,
  UserPresetRegistryError,
} from "../../../src/core/errors.js";

describe("User-friendly error messages", () => {
  describe("InteractiveSelectionError", () => {
    it("should provide helpful suggestion for general errors", () => {
      const error = new InteractiveSelectionError("Something went wrong");
      const message = error.getUserMessage();

      expect(message).toContain("Something went wrong");
      expect(message).toContain("💡 Suggestion:");
      expect(message).toContain(
        "Check your interactive selection configuration and try again",
      );
    });

    it("should include custom suggestion when provided", () => {
      const error = new InteractiveSelectionError("Custom error");
      error.metadata.suggestion = "Try running the command with --help flag";

      const message = error.getUserMessage();
      expect(message).toContain("Custom error");
      expect(message).toContain(
        "💡 Suggestion: Try running the command with --help flag",
      );
    });

    it("should provide context-specific suggestions", () => {
      const error = new InteractiveSelectionError(
        "Invalid configuration",
        ErrorSeverity.HIGH,
        { configPath: "/path/to/config.json" },
      );

      const message = error.getUserMessage();
      expect(message).toContain("Invalid configuration");
      expect(message).toContain("💡 Suggestion:");
    });
  });

  describe("SelectionValidationError", () => {
    it("should provide specific guidance for validation failures", () => {
      const validationErrors = [
        { path: ["rules", "include"], message: "Invalid glob pattern" },
        { path: ["commands", "exclude"], message: "Pattern too broad" },
      ];

      const error = new SelectionValidationError(
        "Selection validation failed",
        validationErrors,
      );

      const message = error.getUserMessage();
      expect(message).toContain("Selection validation failed");
      expect(message).toContain("💡 Suggestion:");
      expect(message).toContain(
        "Review your selection patterns and ensure they match available files",
      );
    });

    it("should format validation errors for user display", () => {
      const validationErrors = [
        { path: ["rules", "include"], message: "Invalid glob pattern" },
        { path: ["mcps"], message: "Unknown MCP server" },
      ];

      const error = new SelectionValidationError(
        "Validation failed",
        validationErrors,
      );

      const formattedErrors = error.getFormattedErrors();
      expect(formattedErrors).toEqual([
        "rules.include: Invalid glob pattern",
        "mcps: Unknown MCP server",
      ]);
    });

    it("should handle empty validation errors gracefully", () => {
      const error = new SelectionValidationError("No validation errors");
      const formattedErrors = error.getFormattedErrors();
      expect(formattedErrors).toEqual([]);
    });
  });

  describe("SourceResolutionError", () => {
    it("should provide network-related suggestions", () => {
      const error = new SourceResolutionError(
        "Failed to resolve GitHub source",
        "github:org/repo",
      );

      const message = error.getUserMessage();
      expect(message).toContain("Failed to resolve GitHub source");
      expect(message).toContain("💡 Suggestion:");
      expect(message).toContain(
        "Verify the source URL and your network connection",
      );
    });

    it("should include source information in context", () => {
      const originalError = new Error("Network timeout");
      const error = new SourceResolutionError(
        "Network error",
        "github:org/repo",
        originalError,
      );

      expect(error.metadata.context?.source).toBe("github:org/repo");
      expect(error.metadata.context?.originalError).toBe("Network timeout");
    });

    it("should provide specific guidance for different source types", () => {
      const githubError = new SourceResolutionError(
        "GitHub API rate limit exceeded",
        "github:org/repo",
      );

      const fsError = new SourceResolutionError(
        "File not found",
        "/local/path",
      );

      expect(githubError.getUserMessage()).toContain(
        "Verify the source URL and your network connection",
      );
      expect(fsError.getUserMessage()).toContain(
        "Verify the source URL and your network connection",
      );
    });
  });

  describe("UserPresetRegistryError", () => {
    it("should provide operation-specific suggestions", () => {
      const addError = new UserPresetRegistryError(
        "Failed to add preset",
        "add",
        "test-preset",
      );

      const getError = new UserPresetRegistryError(
        "Preset not found",
        "get",
        "test-preset",
      );

      const removeError = new UserPresetRegistryError(
        "Failed to remove preset",
        "remove",
        "test-preset",
      );

      expect(addError.getUserMessage()).toContain(
        "Check if the preset name already exists and ensure valid preset data",
      );
      expect(getError.getUserMessage()).toContain(
        "Verify the preset name exists in your registry",
      );
      expect(removeError.getUserMessage()).toContain(
        "Verify the preset name exists in your registry",
      );
    });

    it("should provide generic suggestion for unknown operations", () => {
      const error = new UserPresetRegistryError(
        "Unknown operation failed",
        "unknown",
        "test-preset",
      );

      expect(error.getUserMessage()).toContain(
        "Check your user preset registry file permissions and format",
      );
    });

    it("should include operation details in context", () => {
      const error = new UserPresetRegistryError(
        "Operation failed",
        "update",
        "test-preset",
      );

      expect(error.metadata.context?.operation).toBe("update");
      expect(error.metadata.context?.presetName).toBe("test-preset");
    });
  });

  describe("SelectiveLoadingError", () => {
    it("should provide selection-specific guidance", () => {
      const error = new SelectiveLoadingError(
        "Failed to load selected content",
        "github:org/repo",
        "rules",
      );

      const message = error.getUserMessage();
      expect(message).toContain("Failed to load selected content");
      expect(message).toContain("💡 Suggestion:");
      expect(message).toContain(
        "Verify your selection patterns match available content in the preset",
      );
    });

    it("should include loading context in error details", () => {
      const error = new SelectiveLoadingError(
        "Pattern matching failed",
        "github:org/repo",
        "commands",
      );

      expect(error.metadata.context?.presetSource).toBe("github:org/repo");
      expect(error.metadata.context?.selectionType).toBe("commands");
    });
  });

  describe("ErrorHandler formatting", () => {
    it("should format errors for console output", () => {
      const error = new InteractiveSelectionError("Test error");
      error.metadata.context = { test: "value" };

      const formatted = ErrorHandler.format(error, false);
      expect(formatted).toContain("❌ Test error");
      expect(formatted).not.toContain("Category:");
      expect(formatted).not.toContain("Context:");
    });

    it("should include verbose details when requested", () => {
      const error = new InteractiveSelectionError("Test error");
      error.metadata.context = { test: "value" };

      const formatted = ErrorHandler.format(error, true);
      expect(formatted).toContain("❌ Test error");
      expect(formatted).toContain("Category: config");
      expect(formatted).toContain("Severity: medium");
      expect(formatted).toContain("Context:");
      expect(formatted).toContain('"test": "value"');
    });

    it("should format validation errors with details", () => {
      const validationErrors = [
        { path: ["rules"], message: "Invalid pattern" },
      ];

      const error = new SelectionValidationError(
        "Validation failed",
        validationErrors,
      );

      const formatted = ErrorHandler.format(error, true);
      expect(formatted).toContain("Validation Errors:");
      expect(formatted).toContain("- rules: Invalid pattern");
    });

    it("should create safe serialization objects", () => {
      const originalError = new Error("Original");
      const error = new SourceResolutionError(
        "Test error",
        "github:org/repo",
        originalError,
      );

      const serialized = ErrorHandler.serialize(error);
      expect(serialized).toHaveProperty("name", "SourceResolutionError");
      expect(serialized).toHaveProperty("message", "Test error");
      expect(serialized).toHaveProperty("metadata");
      expect(serialized.metadata).toHaveProperty("timestamp");
      expect(serialized.metadata).not.toHaveProperty("stackTrace");
      expect(serialized).toHaveProperty("originalError");
      expect(serialized.originalError).toHaveProperty("name", "Error");
      expect(serialized.originalError).toHaveProperty("message", "Original");
    });
  });

  describe("Error recovery guidance", () => {
    it("should provide actionable recovery steps", () => {
      const scenarios = [
        {
          error: new SourceResolutionError(
            "GitHub API rate limit exceeded",
            "github:org/repo",
          ),
          expectedKeywords: ["network", "connection", "URL"],
        },
        {
          error: new UserPresetRegistryError(
            "Permission denied",
            "add",
            "test",
          ),
          expectedKeywords: ["permissions", "file", "registry"],
        },
        {
          error: new SelectionValidationError("No files match pattern", []),
          expectedKeywords: ["patterns", "files", "match"],
        },
        {
          error: new SelectiveLoadingError(
            "Invalid glob syntax",
            "github:org/repo",
            "rules",
          ),
          expectedKeywords: ["patterns", "content", "preset"],
        },
      ];

      scenarios.forEach(({ error, expectedKeywords }) => {
        const message = error.getUserMessage();
        expectedKeywords.forEach((keyword) => {
          expect(message.toLowerCase()).toContain(keyword.toLowerCase());
        });
      });
    });

    it("should provide severity-appropriate messaging", () => {
      const lowError = new InteractiveSelectionError(
        "Minor issue",
        ErrorSeverity.LOW,
      );
      const highError = new InteractiveSelectionError(
        "Critical issue",
        ErrorSeverity.HIGH,
      );
      const criticalError = new InteractiveSelectionError(
        "System failure",
        ErrorSeverity.CRITICAL,
      );

      expect(lowError.isRecoverable()).toBe(true);
      expect(highError.isRecoverable()).toBe(true);
      expect(criticalError.isRecoverable()).toBe(false);
    });
  });

  describe("Contextual error information", () => {
    it("should provide detailed error information for debugging", () => {
      const context = {
        presetName: "test-preset",
        operation: "load",
        timestamp: new Date().toISOString(),
      };

      const error = new InteractiveSelectionError(
        "Contextual error",
        ErrorSeverity.MEDIUM,
        context,
      );

      const details = error.getDetails();
      expect(details).toHaveProperty("name", "InteractiveSelectionError");
      expect(details).toHaveProperty("message", "Contextual error");
      expect(details).toHaveProperty("context");
      expect(details.context).toEqual(context);
      expect(details).toHaveProperty("category");
      expect(details).toHaveProperty("severity");
      expect(details).toHaveProperty("timestamp");
    });

    it("should handle missing context gracefully", () => {
      const error = new InteractiveSelectionError("No context error");
      const details = error.getDetails();

      expect(details).toHaveProperty("context");
      expect(details.context).toBeUndefined();
    });
  });
});
