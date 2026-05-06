/**
 * Path normalization utilities for preset filtering
 * Ensures consistent handling of glob patterns across platforms
 */

/**
 * Convert path separators to POSIX style for generated artifacts.
 * Headers and manifests are consumed across platforms, so they should not vary
 * based on the OS that produced them.
 */
export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Validate a namespace for safe use in file paths (defense-in-depth).
 * Prevents path traversal via namespace values even if upstream validation
 * (validateNamespace in schemas.ts) is bypassed by direct function calls.
 * @throws Error if namespace contains path-unsafe characters
 */
export function validateSyncNamespace(namespace: string): void {
  // Must not contain path separators, .., or null bytes
  if (
    namespace.includes("/") ||
    namespace.includes("\\") ||
    namespace.includes("..") ||
    namespace.includes("\0")
  ) {
    throw new Error(
      `Namespace "${namespace}" contains path-unsafe characters. ` +
        "Namespaces must not contain path separators, '..', or null bytes.",
    );
  }

  // Must match safe pattern: alphanumeric, hyphens, underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
    throw new Error(
      `Namespace "${namespace}" contains invalid characters. ` +
        "Use only alphanumeric characters, hyphens, and underscores.",
    );
  }
}
