"use client";

import { useEffect, useRef, useState } from "react";

import { createProjectThumbnailImageLifecycle } from "../../features/dashboard/project-thumbnail-image-lifecycle";
import { useProjectThumbnailQuery } from "../../features/dashboard/project-thumbnail-query";
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
  const thumbnailLifecycleRef = useRef<
    ReturnType<typeof createProjectThumbnailImageLifecycle> | undefined
  >(undefined);
  const thumbnailQuery = useProjectThumbnailQuery(projectId);

  useEffect(() => {
    const thumbnailLifecycle = createProjectThumbnailImageLifecycle({
      createObjectUrl: URL.createObjectURL,
      revokeObjectUrl: URL.revokeObjectURL,
      setState,
      setThumbnailUrl
    });
    thumbnailLifecycleRef.current = thumbnailLifecycle;
    setState("loading");
    setThumbnailUrl(null);

    return () => {
      if (thumbnailLifecycleRef.current === thumbnailLifecycle) {
        thumbnailLifecycleRef.current = undefined;
      }
      thumbnailLifecycle.dispose();
    };
  }, [projectId]);

  useEffect(() => {
    if (thumbnailQuery.data) {
      thumbnailLifecycleRef.current?.apply(thumbnailQuery.data);
      return;
    }

    if (thumbnailQuery.isError) {
      thumbnailLifecycleRef.current?.apply({ state: "error" });
    }
  }, [thumbnailQuery.data, thumbnailQuery.isError]);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent): void {
      if (event.persisted) {
        void thumbnailQuery.refetch();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [thumbnailQuery.refetch]);

  return (
    <BoardThumbnailImage
      className="projectPreview projectArchitecturePreview"
      alt={`${projectName} Architecture 미리보기`}
      src={thumbnailUrl}
      state={state}
    />
  );
}
