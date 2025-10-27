/**
 * Path normalization utilities for preset filtering
 * Ensures consistent handling of glob patterns across platforms
 */

/**
 * Normalize glob patterns for consistent matching
 * - Convert backslashes to forward slashes (Windows compatibility)
 * - Remove duplicate patterns
 * - Ensure consistent format
 */
export function normalizePatterns(patterns: string[]): string[] {
  // Convert to Set for deduplication
  const unique = new Set(
    patterns.map((p) => {
      // Convert backslashes to forward slashes for cross-platform compatibility
      return p.replace(/\\/g, "/");
    }),
  );

  return Array.from(unique).sort(); // Sort for consistent ordering
}

/**
 * Normalize file paths for consistent comparison
 * - Convert to forward slashes
 * - Ensure no trailing slashes (except root)
 */
export function normalizePath(filePath: string): string {
  // Convert backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, "/");

  // Remove trailing slashes (except for root paths)
  if (normalized !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Validate that include patterns actually matched files
 * @param patterns - The include patterns used
 * @param matchedFiles - The files that were matched
 * @param source - The preset source (for error message)
 * @param dir - The directory being searched (for error message)
 * @throws Error if include patterns matched no files
 */
export function validateIncludeMatches(
  patterns: string[],
  matchedFiles: string[],
  source: string,
  dir: string,
): void {
  if (patterns.length > 0 && matchedFiles.length === 0) {
    throw new Error(
      `Include patterns matched no files\n\n` +
      `Patterns: ${patterns.join(", ")}\n` +
      `Source: ${source}\n` +
      `Directory: ${dir}\n\n` +
      `Verify the patterns and source are correct.\n` +
      `Documentation: https://docs.agentsync.dev/presets/filtering`,
    );
  }
}

/**
 * Warn if exclude patterns matched no files
 * (Doesn't throw, just logs to stderr)
 * @param patterns - The exclude patterns used
 * @param originalCount - Number of files before exclusion
 * @param finalCount - Number of files after exclusion
 * @param source - The preset source (for warning message)
 * @param dir - The directory being searched (for warning message)
 */
export function warnIfExcludeMatched(
  patterns: string[],
  originalCount: number,
  finalCount: number,
  source: string,
  dir: string,
): void {
  // Warn if exclude patterns were specified but matched nothing
  if (patterns.length > 0 && originalCount === finalCount) {
    const warningMsg =
      `⚠️  Exclude patterns matched no files\n\n` +
      `Patterns: ${patterns.join(", ")}\n` +
      `Source: ${source}\n` +
      `Directory: ${dir}\n`;

    // Write to stderr for warnings
    process.stderr.write(warningMsg);
  }
}
