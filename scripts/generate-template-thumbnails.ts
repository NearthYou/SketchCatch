import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  AVAILABLE_BRAINBOARD_TEMPLATE_IDS,
  TEMPLATE_IDS,
  type AvailableBrainboardTemplateId,
  type TemplateId
} from "../packages/types/src";
import { getBrainboardTemplateThumbnailAsset } from "../apps/web/features/resource-settings/brainboard-template-thumbnail-manifest";
import { getTemplateThumbnailAsset } from "../apps/web/features/resource-settings/template-thumbnail-manifest";
import { decodeWebpDataUrl } from "./generate-module-thumbnails";

const baseUrl = process.env.TEMPLATE_THUMBNAIL_BASE_URL ?? "http://127.0.0.1:3000";
const chromeBin =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/template-thumbnails"
);
const CAPTURE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;
const TEMPLATE_THUMBNAIL_PUBLIC_PREFIX = "/template-thumbnails/";

export type TemplateThumbnailCaptureId = TemplateId | AvailableBrainboardTemplateId;

export type TemplateThumbnailCaptureTarget = {
  readonly relativeOutputPath: string;
  readonly templateId: TemplateThumbnailCaptureId;
};

export const TEMPLATE_THUMBNAIL_CAPTURE_TARGETS: readonly TemplateThumbnailCaptureTarget[] = [
  ...TEMPLATE_IDS.map(
    (templateId): TemplateThumbnailCaptureTarget => ({
      relativeOutputPath: toRelativeOutputPath(
        getTemplateThumbnailAsset(templateId).src,
        templateId
      ),
      templateId
    })
  ),
  ...AVAILABLE_BRAINBOARD_TEMPLATE_IDS.map((templateId): TemplateThumbnailCaptureTarget => {
    const asset = getBrainboardTemplateThumbnailAsset(templateId);
    if (asset.kind !== "board-capture") {
      throw new Error(`${templateId} does not have a Board capture asset`);
    }

    return {
      relativeOutputPath: toRelativeOutputPath(asset.src, templateId),
      templateId
    };
  })
];

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
        { once: true }
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
  const profileDirectory = await mkdtemp(join(tmpdir(), "template-thumbnails-"));
  let chrome: ChildProcessWithoutNullStreams | undefined;
  let cdp: CdpConnection | undefined;

  try {
    chrome = await launchChrome(profileDirectory);
    cdp = await CdpConnection.connect(await readDevToolsEndpoint(chrome));
    await captureTemplateThumbnailBatch({
      capture: (target) => captureTemplateThumbnail(cdp as CdpConnection, target.templateId),
      outputDirectory,
      targets: TEMPLATE_THUMBNAIL_CAPTURE_TARGETS
    });
  } finally {
    cdp?.close();
    await stopChrome(chrome);
    await rm(profileDirectory, { force: true, recursive: true });
  }
}

export async function captureTemplateThumbnailBatch({
  capture,
  outputDirectory,
  targets
}: {
  readonly capture: (target: TemplateThumbnailCaptureTarget) => Promise<Buffer>;
  readonly outputDirectory: string;
  readonly targets: readonly TemplateThumbnailCaptureTarget[];
}): Promise<void> {
  const stagingDirectory = await mkdtemp(
    join(dirname(outputDirectory), ".template-thumbnails-staging-")
  );
  const stagedCaptures: Array<{
    readonly imageLength: number;
    readonly outputPath: string;
    readonly stagingPath: string;
    readonly templateId: TemplateThumbnailCaptureId;
  }> = [];

  try {
    for (const target of targets) {
      const image = await capture(target);
      const stagingPath = join(stagingDirectory, target.relativeOutputPath);
      const outputPath = join(outputDirectory, target.relativeOutputPath);

      await mkdir(dirname(stagingPath), { recursive: true });
      await writeFile(stagingPath, image);
      stagedCaptures.push({
        imageLength: image.length,
        outputPath,
        stagingPath,
        templateId: target.templateId
      });
    }

    for (const { imageLength, outputPath, stagingPath, templateId } of stagedCaptures) {
      await mkdir(dirname(outputPath), { recursive: true });
      await rename(stagingPath, outputPath);
      console.log(`wrote ${outputPath} (${imageLength} bytes, ${templateId})`);
    }
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
}

export function decodeTemplateWebpDataUrl(dataUrl: string, templateId: string): Buffer {
  return decodeWebpDataUrl(dataUrl, templateId);
}

function toRelativeOutputPath(src: string, templateId: string): string {
  if (!src.startsWith(TEMPLATE_THUMBNAIL_PUBLIC_PREFIX)) {
    throw new Error(
      `${templateId} thumbnail path must start with ${TEMPLATE_THUMBNAIL_PUBLIC_PREFIX}`
    );
  }

  return src.slice(TEMPLATE_THUMBNAIL_PUBLIC_PREFIX.length);
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

async function captureTemplateThumbnail(
  cdp: CdpConnection,
  templateId: TemplateThumbnailCaptureId
): Promise<Buffer> {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const targetId = requireString(target.targetId, "Chrome did not create a target");

  try {
    const attached = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
    const sessionId = requireString(attached.sessionId, "Chrome did not attach to the target");
    const url = new URL("/dev/template-thumbnail", baseUrl);
    url.searchParams.set("templateId", templateId);

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url: url.toString() }, sessionId);

    const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await getCaptureState(cdp, sessionId);

      if (state.error) {
        throw new Error(`${templateId} capture page reported data-template-thumbnail-error`);
      }
      if (state.ready && state.src) {
        return decodeTemplateWebpDataUrl(state.src, templateId);
      }

      await delay(POLL_INTERVAL_MS);
    }

    throw new Error(
      `${templateId} capture timed out after ${CAPTURE_TIMEOUT_MS}ms without a ready marker`
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
        const error = document.querySelector('[data-template-thumbnail-error="true"]');
        const image = document.querySelector('img[data-template-thumbnail-ready="true"]');
        return { error: Boolean(error), ready: Boolean(image), src: image?.getAttribute("src") ?? null };
      })()`,
      returnByValue: true
    },
    sessionId
  );
  const remoteResult = evaluation.result as { readonly value?: unknown } | undefined;
  const value = remoteResult?.value;

  if (!value || typeof value !== "object") {
    throw new Error("Chrome did not return a Template thumbnail capture state");
  }

  const state = value as Partial<CaptureState>;
  return {
    error: state.error === true,
    ready: state.ready === true,
    src: typeof state.src === "string" ? state.src : null
  };
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
