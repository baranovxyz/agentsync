/**
 * Tests for interactive selection error types
 */

import { describe, expect, it } from "vitest";
import {
  ErrorCategory,
  ErrorSeverity,
  InteractiveSelectionError,
  SelectionValidationError,
  SelectiveLoadingError,
  SourceResolutionError,
  UserPresetRegistryError,
} from "../../../src/core/errors.js";

describe("InteractiveSelectionError", () => {
  it("should create an InteractiveSelectionError with default properties", () => {
    const error = new InteractiveSelectionError("Test error");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InteractiveSelectionError");
    expect(error.message).toBe("Test error");
    expect(error.metadata.category).toBe(ErrorCategory.CONFIG);
    expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.metadata.code).toBe("INTERACTIVE_SELECTION_ERROR");
  });

  it("should create an InteractiveSelectionError with custom properties", () => {
    const context = { presetName: "test-preset" };
    const error = new InteractiveSelectionError(
      "Custom error",
      ErrorSeverity.HIGH,
      context,
    );

    expect(error.message).toBe("Custom error");
    expect(error.metadata.severity).toBe(ErrorSeverity.HIGH);
    expect(error.metadata.context).toEqual(context);
  });

  it("should provide user-friendly message with suggestion", () => {
    const error = new InteractiveSelectionError("Test error");
    error.metadata.suggestion = "Check your configuration";

    const userMessage = error.getUserMessage();
    expect(userMessage).toContain("Test error");
    expect(userMessage).toContain("💡 Suggestion: Check your configuration");
  });
});

describe("SelectionValidationError", () => {
  it("should create a SelectionValidationError with default properties", () => {
    const error = new SelectionValidationError("Invalid selection");

    expect(error).toBeInstanceOf(InteractiveSelectionError);
    expect(error.name).toBe("SelectionValidationError");
    expect(error.message).toBe("Invalid selection");
    expect(error.metadata.category).toBe(ErrorCategory.VALIDATION);
    expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.metadata.code).toBe("SELECTION_VALIDATION_FAILED");
  });

  it("should create a SelectionValidationError with validation details", () => {
    const validationErrors = [
      { path: ["rules", "include"], message: "Invalid pattern" },
      { path: ["commands"], message: "Missing required field" },
    ];
    const error = new SelectionValidationError(
      "Validation failed",
      validationErrors,
    );

    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.metadata.context).toHaveProperty("validationIssues");
    expect(error.metadata.context?.validationIssues).toEqual(validationErrors);
  });

  it("should format validation errors correctly", () => {
    const validationErrors = [
      { path: ["rules", "include"], message: "Invalid pattern" },
      { path: ["commands"], message: "Missing required field" },
    ];
    const error = new SelectionValidationError(
      "Validation failed",
      validationErrors,
    );

    const formattedErrors = error.getFormattedErrors();
    expect(formattedErrors).toEqual([
      "rules.include: Invalid pattern",
      "commands: Missing required field",
    ]);
  });
});

describe("SourceResolutionError", () => {
  it("should create a SourceResolutionError with default properties", () => {
    const error = new SourceResolutionError("Failed to resolve source");

    expect(error).toBeInstanceOf(InteractiveSelectionError);
    expect(error.name).toBe("SourceResolutionError");
    expect(error.message).toBe("Failed to resolve source");
    expect(error.metadata.category).toBe(ErrorCategory.NETWORK);
    expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.metadata.code).toBe("SOURCE_RESOLUTION_FAILED");
  });

  it("should create a SourceResolutionError with source details", () => {
    const source = "github:org/repo";
    const originalError = new Error("Network error");
    const error = new SourceResolutionError(
      "Failed to resolve",
      source,
      originalError,
    );

    expect(error.originalError).toBe(originalError);
    expect(error.metadata.context).toEqual({
      source,
      originalError: "Network error",
    });
  });
});

describe("UserPresetRegistryError", () => {
  it("should create a UserPresetRegistryError with default properties", () => {
    const error = new UserPresetRegistryError("Registry operation failed");

    expect(error).toBeInstanceOf(InteractiveSelectionError);
    expect(error.name).toBe("UserPresetRegistryError");
    expect(error.message).toBe("Registry operation failed");
    expect(error.metadata.category).toBe(ErrorCategory.FILE_SYSTEM);
    expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.metadata.code).toBe("USER_PRESET_REGISTRY_ERROR");
  });

  it("should create a UserPresetRegistryError with operation details", () => {
    const operation = "add";
    const presetName = "test-preset";
    const error = new UserPresetRegistryError(
      "Operation failed",
      operation,
      presetName,
    );

    expect(error.metadata.context).toEqual({
      operation,
      presetName,
    });
  });
});

describe("SelectiveLoadingError", () => {
  it("should create a SelectiveLoadingError with default properties", () => {
    const error = new SelectiveLoadingError("Loading failed");

    expect(error).toBeInstanceOf(InteractiveSelectionError);
    expect(error.name).toBe("SelectiveLoadingError");
    expect(error.message).toBe("Loading failed");
    expect(error.metadata.category).toBe(ErrorCategory.PARSE);
    expect(error.metadata.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.metadata.code).toBe("SELECTIVE_LOADING_FAILED");
  });

  it("should create a SelectiveLoadingError with loading details", () => {
    const presetSource = "github:org/repo";
    const selectionType = "rules";
    const error = new SelectiveLoadingError(
      "Loading failed",
      presetSource,
      selectionType,
    );

    expect(error.metadata.context).toEqual({
      presetSource,
      selectionType,
    });
  });
});

describe("Error recovery and formatting", () => {
  it("should determine if error is recoverable", () => {
    const criticalError = new InteractiveSelectionError(
      "Critical error",
      ErrorSeverity.CRITICAL,
    );
    expect(criticalError.isRecoverable()).toBe(false);

    const mediumError = new InteractiveSelectionError(
      "Medium error",
      ErrorSeverity.MEDIUM,
    );
    expect(mediumError.isRecoverable()).toBe(true);
  });

  it("should provide detailed error information", () => {
    const context = { presetName: "test" };
    const error = new InteractiveSelectionError(
      "Test error",
      ErrorSeverity.HIGH,
      context,
    );

    const details = error.getDetails();
    expect(details).toHaveProperty("name", "InteractiveSelectionError");
    expect(details).toHaveProperty("message", "Test error");
    expect(details).toHaveProperty("timestamp");
    expect(details).toHaveProperty("category");
    expect(details).toHaveProperty("severity");
    expect(details).toHaveProperty("context");
    expect(details.context).toEqual(context);
  });
});
