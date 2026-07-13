export function normalizeNonSensitiveHttpUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return value;
  } catch {
    return null;
  }
}
