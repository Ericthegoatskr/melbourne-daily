/** Only a public API origin belongs in browser configuration. Never put keys here. */
export function apiConfigured(
  base = import.meta.env.VITE_DATA_API_URL,
): boolean {
  if (!base) return false;
  try {
    const url = new URL(base);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export function apiUrl(
  path: string,
  base = import.meta.env.VITE_DATA_API_URL,
): string {
  if (!apiConfigured(base))
    throw new Error(
      "This live data service is not connected yet. Please use the official source.",
    );
  if (!path.startsWith("/api/") || path.includes(".."))
    throw new Error("Invalid API path.");
  return `${base!.replace(/\/+$/, "")}${path}`;
}
