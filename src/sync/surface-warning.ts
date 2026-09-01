/** Format a concise warning for canonical content a provider cannot project. */
export function unsupportedSurfaceWarning(
  providerName: string,
  surface: "commands" | "agents",
  count: number,
): string {
  const item =
    count === 1 ? (surface === "commands" ? "command" : "agent") : surface;
  return `${providerName} does not support ${surface}; ${count} ${item} skipped`;
}

/** Format a concise warning for an extension with no provider writer. */
export function unsupportedExtensionWarning(
  providerName: string,
  surface: string,
): string {
  return `${providerName} does not support ${surface}; configuration skipped`;
}
