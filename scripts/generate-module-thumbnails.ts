import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  MODULE_THUMBNAIL_MODULE_IDS,
  type ModuleThumbnailId
} from "../apps/web/features/resource-settings/module-thumbnail-manifest";

const baseUrl = process.env.MODULE_THUMBNAIL_BASE_URL ?? "http://127.0.0.1:3000";
const chromeBin = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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
    { readonly reject: (reason: unknown) => void; readonly resolve: (result: Record<string, unknown>) => void }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", ({ data }) => this.handleMessage(String(data)));
    socket.addEventListener("close", () => this.rejectPending(new Error("Chrome DevTools connection closed")));
    socket.addEventListener("error", () => this.rejectPending(new Error("Chrome DevTools connection failed")));
  }

  static async connect(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Chrome DevTools connection failed")), {
        once: true
      });
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
    await mkdir(outputDirectory, { recursive: true });

    for (const moduleId of MODULE_THUMBNAIL_MODULE_IDS) {
      const image = await captureModuleThumbnail(cdp, moduleId);
      const outputPath = join(outputDirectory, `${moduleId}.webp`);

      await writeFile(outputPath, image);
      console.log(`wrote ${outputPath} (${image.length} bytes)`);
    }
  } finally {
    cdp?.close();
    await stopChrome(chrome);
    await rm(profileDirectory, { force: true, recursive: true });
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

async function captureModuleThumbnail(cdp: CdpConnection, moduleId: ModuleThumbnailId): Promise<Buffer> {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const targetId = requireString(target.targetId, "Chrome did not create a target");
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

  throw new Error(`${moduleId} capture timed out after ${CAPTURE_TIMEOUT_MS}ms without a ready marker`);
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

function decodeWebpDataUrl(dataUrl: string, moduleId: ModuleThumbnailId): Buffer {
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

  return image;
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
