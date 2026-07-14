"use client";

import { useEffect, useState } from "react";

import { createProjectThumbnailImageLifecycle } from "../../features/dashboard/project-thumbnail-image-lifecycle";
import { loadProjectThumbnail } from "../../features/dashboard/project-thumbnail-loader";
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
    const thumbnailLifecycle = createProjectThumbnailImageLifecycle({
      createObjectUrl: URL.createObjectURL,
      revokeObjectUrl: URL.revokeObjectURL,
      setState,
      setThumbnailUrl
    });

    setState("loading");
    setThumbnailUrl(null);

    void loadProjectThumbnail({
      fetchThumbnail: fetchProjectThumbnail,
      isCancelled: () => cancelled,
      projectId
    })
      .then(thumbnailLifecycle.apply)
      .catch(() => {
        thumbnailLifecycle.apply({ state: "error" });
      });

    return () => {
      cancelled = true;
      thumbnailLifecycle.dispose();
    };
  }, [projectId]);

  return (
    <BoardThumbnailImage
      className="projectPreview projectArchitecturePreview"
      alt={`${projectName} Architecture 미리보기`}
      src={thumbnailUrl}
      state={state}
    />
  );
}
