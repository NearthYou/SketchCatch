"use client";

import { useCallback, useRef, useState } from "react";
import type { DiagramJson } from "@sketchcatch/types";
import { DiagramEditor } from "../../../features/diagram-editor";
import { captureActualBoardElement } from "../../../features/workspace/project-board-thumbnail";
import styles from "./module-thumbnail.module.css";

const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

export function ModuleThumbnailCaptureClient({ diagram }: { readonly diagram: DiagramJson }) {
  const captureStartedRef = useRef(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const handleBoardReady = useCallback((element: HTMLElement) => {
    if (captureStartedRef.current) return;
    captureStartedRef.current = true;

    void captureBoard(element)
      .then(setImageDataUrl)
      .catch(() => setCaptureFailed(true));
  }, []);

  return (
    <main className={styles.thumbnailFrame}>
      {captureFailed ? (
        <p data-module-thumbnail-error="true">Module thumbnail capture failed.</p>
      ) : imageDataUrl ? (
        <img
          alt=""
          className={styles.thumbnailImage}
          data-module-thumbnail-ready="true"
          height={THUMBNAIL_HEIGHT}
          src={imageDataUrl}
          width={THUMBNAIL_WIDTH}
        />
      ) : (
        <DiagramEditor
          initialDiagram={diagram}
          initialPreviewDiagram={diagram}
          mode="viewer"
          onBoardReady={handleBoardReady}
          rightPanel={null}
          showSaveAction={false}
        />
      )}
    </main>
  );
}

async function captureBoard(element: HTMLElement): Promise<string> {
  await document.fonts.ready;
  await Promise.all(
    Array.from(element.querySelectorAll<HTMLImageElement>("img"), waitForImage)
  );
  await nextAnimationFrame();
  await nextAnimationFrame();

  const blob = await captureActualBoardElement(element, {
    preserveLowZoomLabels: true
  });
  const dataUrl = await blobToDataUrl(blob);

  if (!dataUrl.startsWith("data:image/webp;base64,")) {
    throw new Error("Module thumbnail capture did not produce WebP data.");
  }

  return dataUrl;
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();

  return new Promise((resolve) => {
    image.addEventListener("error", () => resolve(), { once: true });
    image.addEventListener("load", () => resolve(), { once: true });
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.readAsDataURL(blob);
  });
}
