import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { BOARD_THUMBNAIL_CAPTURE_CONTRACT } from "../apps/web/components/architecture-board/board-thumbnail-capture-contract";
import {
  MODULE_THUMBNAIL_MODULE_IDS,
  type ModuleThumbnailId
} from "../apps/web/features/resource-settings/module-thumbnail-manifest";

const baseUrl = process.env.MODULE_THUMBNAIL_BASE_URL ?? "http://127.0.0.1:3000";
const chromeBin =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/module-thumbnails/v1"
);
const CAPTURE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

type CaptureState = {
  readonly error: boolean;
  readonly ready: boolean;
  readonly src: string | null;
};

type CdpResponse = {
  readonly error?: { readonly message: string } | undefined;
  readonly id?: number | undefined;
  readonly result?: Record<string, unknown> | undefined;
  readonly sessionId?: string | undefined;
};

class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      readonly reject: (reason: unknown) => void;
      readonly resolve: (result: Record<string, unknown>) => void;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", ({ data }) => this.handleMessage(String(data)));
    socket.addEventListener("close", () =>
      this.rejectPending(new Error("Chrome DevTools connection closed"))
    );
    socket.addEventListener("error", () =>
      this.rejectPending(new Error("Chrome DevTools connection failed"))
    );
  }

  static async connect(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Chrome DevTools connection failed")),
        {
          once: true
        }
      );
    });

    return new CdpConnection(socket);
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(data: string): void {
    const response = JSON.parse(data) as CdpResponse;
    if (response.id === undefined) return;

    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message));
      return;
    }

    pending.resolve(response.result ?? {});
  }

  private rejectPending(error: Error): void {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}

async function main(): Promise<void> {
  const profileDirectory = await mkdtemp(join(tmpdir(), "module-thumbnails-"));
  let chrome: ChildProcessWithoutNullStreams | undefined;
  let cdp: CdpConnection | undefined;

  try {
    chrome = await launchChrome(profileDirectory);
    cdp = await CdpConnection.connect(await readDevToolsEndpoint(chrome));
    await captureModuleThumbnailBatch({
      capture: (moduleId) => captureModuleThumbnail(cdp as CdpConnection, moduleId),
      moduleIds: MODULE_THUMBNAIL_MODULE_IDS,
      outputDirectory
    });
  } finally {
    cdp?.close();
    await stopChrome(chrome);
    await rm(profileDirectory, { force: true, recursive: true });
  }
}

export async function captureModuleThumbnailBatch({
  capture,
  moduleIds,
  outputDirectory
}: {
  readonly capture: (moduleId: ModuleThumbnailId) => Promise<Buffer>;
  readonly moduleIds: readonly ModuleThumbnailId[];
  readonly outputDirectory: string;
}): Promise<void> {
  const stagingParent = dirname(outputDirectory);
  await mkdir(stagingParent, { recursive: true });
  const stagingDirectory = await mkdtemp(join(stagingParent, ".module-thumbnails-staging-"));
  const stagedCaptures: Array<{
    readonly imageLength: number;
    readonly moduleId: ModuleThumbnailId;
    readonly stagingPath: string;
  }> = [];

  try {
    for (const moduleId of moduleIds) {
      const image = await capture(moduleId);
      const stagingPath = join(stagingDirectory, `${moduleId}.webp`);

      await writeFile(stagingPath, image);
      stagedCaptures.push({ imageLength: image.length, moduleId, stagingPath });
    }

    await mkdir(outputDirectory, { recursive: true });
    for (const { imageLength, moduleId, stagingPath } of stagedCaptures) {
      const outputPath = join(outputDirectory, `${moduleId}.webp`);
      await rename(stagingPath, outputPath);
      console.log(`wrote ${outputPath} (${imageLength} bytes)`);
    }
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
}

function launchChrome(profileDirectory: string): Promise<ChildProcessWithoutNullStreams> {
  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      "--disable-gpu",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "--window-size=1280,720"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  return new Promise((resolve, reject) => {
    chrome.once("error", reject);
    chrome.once("spawn", () => resolve(chrome));
  });
}

function readDevToolsEndpoint(chrome: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error("Chrome did not report a DevTools websocket endpoint within 10 seconds"));
    }, 10_000);
    const read = (chunk: Buffer | string) => {
      output += String(chunk);
      const endpoint = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];

      if (endpoint) {
        clearTimeout(timeout);
        resolve(endpoint);
      }
    };

    chrome.stdout.on("data", read);
    chrome.stderr.on("data", read);
    chrome.once("close", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before exposing DevTools (code ${code})`));
    });
  });
}

async function captureModuleThumbnail(
  cdp: CdpConnection,
  moduleId: ModuleThumbnailId
): Promise<Buffer> {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const targetId = requireString(target.targetId, "Chrome did not create a target");

  try {
    const attached = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
    const sessionId = requireString(attached.sessionId, "Chrome did not attach to the target");
    const url = new URL("/dev/module-thumbnail", baseUrl);
    url.searchParams.set("moduleId", moduleId);

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url: url.toString() }, sessionId);

    const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await getCaptureState(cdp, sessionId);

      if (state.error) {
        throw new Error(`${moduleId} capture page reported data-module-thumbnail-error`);
      }
      if (state.ready && state.src) {
        return decodeWebpDataUrl(state.src, moduleId);
      }

      await delay(POLL_INTERVAL_MS);
    }

    throw new Error(
      `${moduleId} capture timed out after ${CAPTURE_TIMEOUT_MS}ms without a ready marker`
    );
  } finally {
    await cdp.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
}

async function getCaptureState(cdp: CdpConnection, sessionId: string): Promise<CaptureState> {
  const evaluation = await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const error = document.querySelector('[data-module-thumbnail-error="true"]');
        const image = document.querySelector('img[data-module-thumbnail-ready="true"]');
        return { error: Boolean(error), ready: Boolean(image), src: image?.getAttribute("src") ?? null };
      })()`,
      returnByValue: true
    },
    sessionId
  );
  const remoteResult = evaluation.result as { readonly value?: unknown } | undefined;
  const value = remoteResult?.value;

  if (!value || typeof value !== "object") {
    throw new Error("Chrome did not return a module thumbnail capture state");
  }

  const state = value as Partial<CaptureState>;
  return {
    error: state.error === true,
    ready: state.ready === true,
    src: typeof state.src === "string" ? state.src : null
  };
}

export function decodeWebpDataUrl(dataUrl: string, moduleId: ModuleThumbnailId): Buffer {
  const encoded = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl)?.[1];
  if (!encoded) {
    throw new Error(`${moduleId} ready marker does not contain a WebP data URL`);
  }

  const image = Buffer.from(encoded, "base64");
  if (
    image.subarray(0, 4).toString("ascii") !== "RIFF" ||
    image.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error(`${moduleId} ready marker did not contain a RIFF/WEBP image`);
  }

  const dimensions = readWebpDimensions(image, moduleId);
  if (
    dimensions.width !== BOARD_THUMBNAIL_CAPTURE_CONTRACT.width ||
    dimensions.height !== BOARD_THUMBNAIL_CAPTURE_CONTRACT.height
  ) {
    throw new Error(
      `${moduleId} ready marker expected ${BOARD_THUMBNAIL_CAPTURE_CONTRACT.width} × ${BOARD_THUMBNAIL_CAPTURE_CONTRACT.height}, received ${dimensions.width} × ${dimensions.height}`
    );
  }

  return image;
}

function readWebpDimensions(
  image: Buffer,
  moduleId: ModuleThumbnailId
): { readonly height: number; readonly width: number } {
  let chunkOffset = 12;

  while (chunkOffset + 8 <= image.length) {
    const chunkType = image.subarray(chunkOffset, chunkOffset + 4).toString("ascii");
    const chunkSize = image.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;
    const chunkEnd = dataOffset + chunkSize;
    if (chunkEnd > image.length) break;

    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        height: image.readUIntLE(dataOffset + 7, 3) + 1,
        width: image.readUIntLE(dataOffset + 4, 3) + 1
      };
    }

    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      image.subarray(dataOffset + 3, dataOffset + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))
    ) {
      return {
        height: image.readUInt16LE(dataOffset + 8) & 0x3fff,
        width: image.readUInt16LE(dataOffset + 6) & 0x3fff
      };
    }

    if (chunkType === "VP8L" && chunkSize >= 5 && image[dataOffset] === 0x2f) {
      const sizeBits = image.readUInt32LE(dataOffset + 1);
      return {
        height: ((sizeBits >>> 14) & 0x3fff) + 1,
        width: (sizeBits & 0x3fff) + 1
      };
    }

    chunkOffset = chunkEnd + (chunkSize % 2);
  }

  throw new Error(`${moduleId} ready marker did not contain readable WebP dimensions`);
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string") throw new Error(message);
  return value;
}

async function stopChrome(chrome: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!chrome || chrome.exitCode !== null) return;

  const closed = new Promise<void>((resolve) => chrome.once("close", () => resolve()));
  chrome.kill("SIGTERM");
  await Promise.race([closed, delay(5_000)]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
  );
}

if (isDirectExecution()) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
