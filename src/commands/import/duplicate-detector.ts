/**
 * Duplicate Detection for Imports
 * Identifies files with same normalized names across different import sources
 */

import type {
  CanonicalCommand,
  CanonicalRule,
  ImportedCommand,
  ImportedRule,
} from "../../types/canonical.js";

export interface DuplicateVariant {
  source: string;
  filename: string;
  content: CanonicalRule | CanonicalCommand;
  modifiedTime?: Date;
}

export interface DuplicateGroup {
  normalizedName: string;
  variants: DuplicateVariant[];
}

/**
 * Normalize filename for comparison
 * Removes .md/.mdc extensions and lowercases
 * Also removes source prefixes (cursor_, claude_, cline_, roocode_)
 * Examples: "typescript.md", "TypeScript.mdc", "cursor_typescript.md" -> "typescript"
 */
function normalizeFilename(filename: string): string {
  let normalized = filename.toLowerCase().replace(/\.(md|mdc)$/, ""); // Remove extensions

  // Remove source prefixes (cursor_, claude_, cline_, roocode_)
  normalized = normalized.replace(/^(cursor|claude|cline|roocode)_/, "");

  return normalized;
}

/**
 * Detect duplicate files across multiple sources
 * Returns only groups with 2+ variants (actual duplicates)
 *
 * @param sources - Map of source names to Maps of files
 * @returns Array of duplicate groups with 2+ variants
 */
export function detectDuplicates(
  sources: Map<
    string,
    Map<
      string,
      (CanonicalRule | CanonicalCommand) | (ImportedRule | ImportedCommand)
    >
  >,
): DuplicateGroup[] {
  // Group by normalized filename
  const byNormalized = new Map<string, DuplicateVariant[]>();

  for (const [source, files] of sources) {
    for (const [filename, content] of files) {
      const normalized = normalizeFilename(filename);

      if (!byNormalized.has(normalized)) {
        byNormalized.set(normalized, []);
      }

      byNormalized.get(normalized)!.push({
        source,
        filename,
        content,
        modifiedTime: (content as ImportedRule | ImportedCommand).modifiedTime,
      });
    }
  }

  // Return only groups with 2+ variants
  const duplicates: DuplicateGroup[] = [];
  for (const [normalizedName, variants] of byNormalized) {
    if (variants.length > 1) {
      duplicates.push({
        normalizedName,
        variants,
      });
    }
  }

  return duplicates;
}

/**
 * Get a simple description of duplicates for warning message
 */
export function formatDuplicateSummary(duplicates: DuplicateGroup[]): string {
  if (duplicates.length === 0) {
    return "";
  }

  const names = duplicates.map((d) => d.normalizedName).join(", ");
  const count = duplicates.length;
  return `Found ${count} duplicate${count > 1 ? "s" : ""}: ${names}`;
}

/**
 * Format detailed duplicate information for user display
 */
export function formatDuplicateDetails(duplicateGroup: DuplicateGroup): string {
  const { normalizedName, variants } = duplicateGroup;
  let output = `\n⚠️  Duplicate: ${normalizedName}\n`;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const isNewest =
      i === 0 ||
      (variant.modifiedTime &&
        variants[0].modifiedTime &&
        variant.modifiedTime > variants[0].modifiedTime);

    output += `\n  ${i + 1}. ${variant.source}/${variant.filename}`;
    if (variant.modifiedTime) {
      output += ` (modified: ${variant.modifiedTime.toISOString()})`;
    }
    if (isNewest && i > 0) {
      output += ` ${" ← newest"}`;
    }

    const desc = variant.content.frontmatter.description;
    if (desc) {
      output += `\n     Description: ${desc}`;
    }
  }

  return output;
}
