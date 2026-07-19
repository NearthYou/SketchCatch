"use client";

import { useEffect, useState } from "react";

import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "./board-thumbnail-capture-contract";

export type BoardThumbnailImageState = "empty" | "error" | "loading" | "ready";

const fallbackMessages: Record<Exclude<BoardThumbnailImageState, "ready">, string> = {
  empty: "저장된 보드 캡처가 없습니다.",
  error: "보드 캡처를 불러오지 못했습니다.",
  loading: "보드 캡처를 불러오는 중입니다."
};

// Template과 Project 카드가 동일한 16:9 캡처 표현과 오류 상태를 공유합니다.
export function BoardThumbnailImage({
  alt,
  className,
  src,
  state = src ? "ready" : "empty"
}: {
  readonly alt: string;
  readonly className?: string | undefined;
  readonly src: string | null;
  readonly state?: BoardThumbnailImageState | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  const resolvedState = imageFailed ? "error" : state === "ready" && !src ? "empty" : state;
  const fallbackMessage = resolvedState === "ready" ? null : fallbackMessages[resolvedState];

  return (
    <div
      className={className}
      data-state={resolvedState}
      style={{
        aspectRatio: BOARD_THUMBNAIL_CAPTURE_CONTRACT.aspectRatio,
        background: BOARD_THUMBNAIL_CAPTURE_CONTRACT.backgroundColor,
        display: "grid",
        minWidth: 0,
        overflow: "hidden",
        placeItems: "center",
        position: "relative",
        width: "100%"
      }}
    >
      {resolvedState === "ready" && src ? (
        <img
          alt={alt}
          onError={() => setImageFailed(true)}
          src={src}
          style={{ display: "block", height: "100%", objectFit: "contain", width: "100%" }}
        />
      ) : (
        <span
          style={{
            color: "#73777f",
            fontSize: "calc(12px + var(--presentation-font-size-increase))",
            lineHeight: 1.5,
            maxWidth: 240,
            padding: 24,
            textAlign: "center"
          }}
        >
          {fallbackMessage}
        </span>
      )}
    </div>
  );
}
