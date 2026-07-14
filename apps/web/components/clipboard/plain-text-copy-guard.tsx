"use client";

import { useEffect } from "react";
import { writePlainTextToCopyEvent } from "../../lib/clipboard";

/** Keep ordinary page selections as text/plain instead of rich HTML clipboard data. */
export function PlainTextCopyGuard() {
  useEffect(() => {
    function handleCopy(event: ClipboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) {
        return;
      }

      writePlainTextToCopyEvent(event, window.getSelection()?.toString() ?? "");
    }

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, []);

  return null;
}
