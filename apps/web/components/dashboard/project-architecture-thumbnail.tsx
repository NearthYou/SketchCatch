"use client";

import { useEffect, useState } from "react";

import { fetchProjectThumbnail } from "../../features/workspace/api";
import { BoardThumbnailImage, type BoardThumbnailImageState } from "../architecture-board/BoardThumbnailImage";

// 저장 시 캡처한 실제 Board image를 Project 카드에서 안전하게 수명 관리해 표시합니다.
export function ProjectArchitectureThumbnail({
  projectId,
  projectName
}: {
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [state, setState] = useState<BoardThumbnailImageState>("loading");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setState("loading");
    setThumbnailUrl(null);

    void fetchProjectThumbnail(projectId).then((blob) => {
      if (cancelled) {
        return;
      }

      if (!blob) {
        setState("empty");
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setThumbnailUrl(objectUrl);
      setState("ready");
    }).catch(() => {
      if (!cancelled) {
        setState("error");
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [projectId]);

  return (
    <BoardThumbnailImage
      className="projectArchitecturePreview"
      alt={`${projectName} Architecture 미리보기`}
      src={thumbnailUrl}
      state={state}
    />
  );
}
