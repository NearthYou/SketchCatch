/**
 * Copy text in both secure browser contexts and local/insecure development pages.
 * Clipboard API is unavailable in some HTTP origins, so keep a textarea fallback.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Local HTTP, a lost user activation, or a denied browser permission can reject this API.
      // Continue with the browser-compatible text-only fallback below.
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable outside a browser");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed");
    }
  } finally {
    textarea.remove();
  }
}

/** Replace the browser's rich HTML selection payload with plain text. */
export function writePlainTextToCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text || !event.clipboardData) {
    return false;
  }

  event.preventDefault();
  event.clipboardData.setData("text/plain", text);
  return true;
}
