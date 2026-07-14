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
    let latestRequest = 0;
    const thumbnailLifecycle = createProjectThumbnailImageLifecycle({
      createObjectUrl: URL.createObjectURL,
      revokeObjectUrl: URL.revokeObjectURL,
      setState,
      setThumbnailUrl
    });

    function refreshThumbnail(): void {
      const request = latestRequest + 1;
      latestRequest = request;

      setState("loading");
      setThumbnailUrl(null);

      void loadProjectThumbnail({
        fetchThumbnail: fetchProjectThumbnail,
        isCancelled: () => cancelled || latestRequest !== request,
        projectId
      })
        .then((result) => {
          if (cancelled || latestRequest !== request) {
            return;
          }

          thumbnailLifecycle.apply(result);
        })
        .catch(() => {
          if (cancelled || latestRequest !== request) {
            return;
          }

          thumbnailLifecycle.apply({ state: "error" });
        });
    }

    function handlePageShow(event: PageTransitionEvent): void {
      if (!event.persisted) {
        return;
      }

      refreshThumbnail();
    }

    refreshThumbnail();
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
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
