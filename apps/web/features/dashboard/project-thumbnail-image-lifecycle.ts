import type { BoardThumbnailImageState } from "../../components/architecture-board/BoardThumbnailImage";
import type { ProjectThumbnailLoadResult } from "./project-thumbnail-loader";

type ProjectThumbnailImageLifecycleInput = {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (objectUrl: string) => void;
  readonly setState: (state: BoardThumbnailImageState) => void;
  readonly setThumbnailUrl: (objectUrl: string | null) => void;
};

// React effect 밖에서 늦게 도착한 thumbnail과 object URL 정리를 한 단위로 관리합니다.
export function createProjectThumbnailImageLifecycle({
  createObjectUrl,
  revokeObjectUrl,
  setState,
  setThumbnailUrl
}: ProjectThumbnailImageLifecycleInput): {
  readonly apply: (result: ProjectThumbnailLoadResult) => void;
  readonly dispose: () => void;
} {
  let disposed = false;
  let objectUrl: string | null = null;

  return {
    apply(result) {
      if (disposed || result.state === "cancelled") {
        return;
      }

      if (result.state !== "ready") {
        setState(result.state);
        return;
      }

      if (objectUrl !== null) {
        revokeObjectUrl(objectUrl);
      }

      objectUrl = createObjectUrl(result.blob);
      setThumbnailUrl(objectUrl);
      setState("ready");
    },
    dispose() {
      disposed = true;

      if (objectUrl !== null) {
        revokeObjectUrl(objectUrl);
        objectUrl = null;
      }
    }
  };
}
