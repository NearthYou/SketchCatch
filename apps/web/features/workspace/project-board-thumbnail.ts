import { toCanvas } from "html-to-image";

import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../../components/architecture-board/board-thumbnail-capture-contract";
import {
  abortProjectAssetUpload,
  confirmProjectAssetUpload,
  createProjectAssetUpload,
  uploadProjectAsset
} from "./api";
import {
  getBoardViewportFromCssTransform,
  getFullBoardThumbnailViewport,
  getLogicalBoardBoundsFromRenderedNodes
} from "./project-board-thumbnail-viewbox";

type ProjectBoardThumbnailCaptureDependencies = {
  readonly abortProjectAssetUpload: typeof abortProjectAssetUpload;
  readonly captureElement: (element: HTMLElement) => Promise<Blob>;
  readonly confirmProjectAssetUpload: typeof confirmProjectAssetUpload;
  readonly createProjectAssetUpload: typeof createProjectAssetUpload;
  readonly findCaptureElement: () => HTMLElement | null;
  readonly uploadProjectAsset: typeof uploadProjectAsset;
};

export type ProjectBoardThumbnailCaptureResult =
  | { readonly status: "skipped" }
  | { readonly assetId: string; readonly status: "uploaded" };

const defaultDependencies: ProjectBoardThumbnailCaptureDependencies = {
  abortProjectAssetUpload,
  captureElement: captureActualBoardElement,
  confirmProjectAssetUpload,
  createProjectAssetUpload,
  findCaptureElement: findActualBoardCaptureElement,
  uploadProjectAsset
};

// 실제 ReactFlow DOM을 찾지 못한 환경에서는 Project 저장 자체를 방해하지 않습니다.
function findActualBoardCaptureElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector<HTMLElement>(BOARD_THUMBNAIL_CAPTURE_CONTRACT.sourceSelector);
}

// 화면 밖 Resource도 보존하려고 현재 Board를 16:9 복제본으로 맞춘 뒤 렌더링합니다.
export async function captureActualBoardElement(element: HTMLElement): Promise<Blob> {
  const captureClone = createFullBoardCaptureClone(element);

  try {
    const sourceCanvas = await toCanvas(captureClone ?? element, {
      backgroundColor: BOARD_THUMBNAIL_CAPTURE_CONTRACT.backgroundColor,
      cacheBust: true,
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2)
    });
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = BOARD_THUMBNAIL_CAPTURE_CONTRACT.width;
    outputCanvas.height = BOARD_THUMBNAIL_CAPTURE_CONTRACT.height;

    const context = outputCanvas.getContext("2d");

    if (!context || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
      throw new Error("Board 캡처 canvas를 만들지 못했습니다.");
    }

    context.fillStyle = BOARD_THUMBNAIL_CAPTURE_CONTRACT.backgroundColor;
    context.fillRect(
      0,
      0,
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.width,
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.height
    );

    const scale = Math.min(
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.width / sourceCanvas.width,
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.height / sourceCanvas.height
    );
    const renderedWidth = sourceCanvas.width * scale;
    const renderedHeight = sourceCanvas.height * scale;

    context.drawImage(
      sourceCanvas,
      (BOARD_THUMBNAIL_CAPTURE_CONTRACT.width - renderedWidth) / 2,
      (BOARD_THUMBNAIL_CAPTURE_CONTRACT.height - renderedHeight) / 2,
      renderedWidth,
      renderedHeight
    );

    const blob = await canvasToWebpBlob(outputCanvas);

    if (blob.type !== BOARD_THUMBNAIL_CAPTURE_CONTRACT.contentType) {
      throw new Error("이 브라우저는 WebP Board 캡처를 지원하지 않습니다.");
    }

    return blob;
  } finally {
    captureClone?.remove();
  }
}

function createFullBoardCaptureClone(element: HTMLElement): HTMLElement | null {
  const sourceViewport = element.querySelector<HTMLElement>(".react-flow__viewport");

  if (!sourceViewport || typeof document === "undefined") {
    return null;
  }

  const viewport = getBoardViewportFromCssTransform(getComputedStyle(sourceViewport).transform);
  const bounds = viewport
    ? getLogicalBoardBoundsFromRenderedNodes({
        nodeRects: Array.from(element.querySelectorAll<HTMLElement>(".react-flow__node"), (node) =>
          node.getBoundingClientRect()
        ),
        rootRect: element.getBoundingClientRect(),
        viewport
      })
    : null;

  if (!bounds) {
    return null;
  }

  const thumbnailViewport = getFullBoardThumbnailViewport(bounds, {
    height: BOARD_THUMBNAIL_CAPTURE_CONTRACT.height,
    width: BOARD_THUMBNAIL_CAPTURE_CONTRACT.width
  });
  const clone = element.cloneNode(true) as HTMLElement;
  const cloneViewport = clone.querySelector<HTMLElement>(".react-flow__viewport");

  if (!cloneViewport) {
    return null;
  }

  clone.style.height = `${BOARD_THUMBNAIL_CAPTURE_CONTRACT.height}px`;
  // html-to-image는 화면 밖에 놓인 복제본을 빈 Canvas로 렌더링할 수 있습니다.
  // 캡처가 끝나는 즉시 제거하므로, 실제 paint tree 안의 원점에서만 잠깐 렌더링합니다.
  clone.style.left = "0";
  clone.style.maxWidth = "none";
  clone.style.minHeight = `${BOARD_THUMBNAIL_CAPTURE_CONTRACT.height}px`;
  clone.style.pointerEvents = "none";
  clone.style.position = "fixed";
  clone.style.top = "0";
  clone.style.width = `${BOARD_THUMBNAIL_CAPTURE_CONTRACT.width}px`;
  clone.style.zIndex = "2147483647";
  cloneViewport.style.transform = `translate(${thumbnailViewport.x}px, ${thumbnailViewport.y}px) scale(${thumbnailViewport.zoom})`;
  document.body.append(clone);

  return clone;
}

// Canvas encoder의 callback 결과를 실패 가능한 Promise로 정규화합니다.
function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Board 캡처를 WebP로 인코딩하지 못했습니다."));
      },
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.contentType,
      BOARD_THUMBNAIL_CAPTURE_CONTRACT.quality
    );
  });
}

// 실제 DOM 캡처, asset metadata, binary 업로드와 confirm/abort 순서를 한 서비스로 묶습니다.
export function createProjectBoardThumbnailCaptureService(
  dependencies: ProjectBoardThumbnailCaptureDependencies
) {
  const captureStates = new Map<
    string,
    {
      latestElement: HTMLElement | undefined;
      promise: Promise<ProjectBoardThumbnailCaptureResult>;
      rerunRequested: boolean;
    }
  >();

  // 한 Project에 동시에 들어온 autosave 요청은 같은 실제 DOM 캡처와 업로드를 공유합니다.
  async function captureAndUploadOnce(
    projectId: string,
    exactElement: HTMLElement | undefined
  ): Promise<ProjectBoardThumbnailCaptureResult> {
    const captureElement = exactElement ?? dependencies.findCaptureElement();

    if (!captureElement || captureElement.isConnected === false) {
      return { status: "skipped" };
    }

    const capture = await dependencies.captureElement(captureElement);
    const created = await dependencies.createProjectAssetUpload({
      assetType: "thumbnail",
      byteSize: capture.size,
      contentType: BOARD_THUMBNAIL_CAPTURE_CONTRACT.contentType,
      fileName: "architecture-board.webp",
      projectId
    });

    try {
      await dependencies.uploadProjectAsset(created.upload, capture);
      await dependencies.confirmProjectAssetUpload({
        assetId: created.asset.id,
        projectId
      });
    } catch (error) {
      await dependencies.abortProjectAssetUpload({
        assetId: created.asset.id,
        projectId
      }).catch(() => undefined);
      throw error;
    }

    return { assetId: created.asset.id, status: "uploaded" };
  }

  // 진행 중 요청 뒤에 도착한 autosave들은 병렬 실행 없이 마지막 Board 상태를 한 번 더 캡처합니다.
  async function captureUntilCurrent(
    projectId: string,
    state: { latestElement: HTMLElement | undefined; rerunRequested: boolean }
  ): Promise<ProjectBoardThumbnailCaptureResult> {
    let result: ProjectBoardThumbnailCaptureResult;

    do {
      state.rerunRequested = false;
      const element = state.latestElement;
      result = await captureAndUploadOnce(projectId, element);
    } while (state.rerunRequested);

    return result;
  }

  return {
    captureAndUpload({
      element,
      projectId
    }: {
      readonly element?: HTMLElement | undefined;
      readonly projectId: string;
    }): Promise<ProjectBoardThumbnailCaptureResult> {
      const existingState = captureStates.get(projectId);

      if (existingState) {
        existingState.latestElement = element;
        existingState.rerunRequested = true;
        return existingState.promise;
      }

      const state = {
        latestElement: element,
        promise: Promise.resolve<ProjectBoardThumbnailCaptureResult>({ status: "skipped" }),
        rerunRequested: false
      };
      const capture = Promise.resolve()
        .then(() => captureUntilCurrent(projectId, state))
        .finally(() => {
          if (captureStates.get(projectId) === state) {
            captureStates.delete(projectId);
          }
        });
      state.promise = capture;
      captureStates.set(projectId, state);

      return capture;
    }
  };
}

const defaultCaptureService = createProjectBoardThumbnailCaptureService(defaultDependencies);

// Server draft 저장 완료 후 호출하는 기본 실제 Board 캡처 진입점입니다.
export function captureAndUploadProjectBoardThumbnail(input: {
  readonly element?: HTMLElement | undefined;
  readonly projectId: string;
}): Promise<ProjectBoardThumbnailCaptureResult> {
  return defaultCaptureService.captureAndUpload(input);
}
