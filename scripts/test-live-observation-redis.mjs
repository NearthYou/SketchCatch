import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const REDIS_URL_ENV = "LIVE_OBSERVATION_REDIS_TEST_URL";
const REDIS_IMAGE = "redis:8-alpine";
const REDIS_PORT = "6379/tcp";
const READY_TIMEOUT_MS = 30_000;
const DOCKER_RUN_TIMEOUT_MS = 120_000;
const DOCKER_COMMAND_TIMEOUT_MS = 10_000;
const INTEGRATION_TIMEOUT_MS = 180_000;

let activeChild = null;
let interruptedSignal = null;

const handleSignal = (signal) => {
  interruptedSignal = signal;
  activeChild?.kill(signal);
};

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

try {
  await runRedisIntegration();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Redis integration test failed");
  process.exitCode =
    interruptedSignal === "SIGINT" ? 130 : interruptedSignal === "SIGTERM" ? 143 : 1;
} finally {
  process.off("SIGINT", handleSignal);
  process.off("SIGTERM", handleSignal);
}

async function runRedisIntegration() {
  const hasExplicitUrl = Object.hasOwn(process.env, REDIS_URL_ENV);
  const explicitUrl = process.env[REDIS_URL_ENV];

  if (hasExplicitUrl) {
    if (typeof explicitUrl !== "string" || explicitUrl.trim() === "") {
      throw new Error(`${REDIS_URL_ENV} must be nonblank when set`);
    }
    await runIntegrationTests(explicitUrl.trim());
    return;
  }

  const containerName = [
    "sketchcatch-lo-redis",
    process.pid,
    randomUUID().replaceAll("-", "").slice(0, 12)
  ].join("-");
  let failure;

  try {
    await runCommand(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        containerName,
        "--publish",
        `127.0.0.1::${REDIS_PORT}`,
        REDIS_IMAGE
      ],
      { capture: true, timeoutMs: DOCKER_RUN_TIMEOUT_MS }
    );

    const portReply = await runCommand("docker", ["port", containerName, REDIS_PORT], {
      capture: true,
      timeoutMs: DOCKER_COMMAND_TIMEOUT_MS
    });
    const hostPort = parsePublishedPort(portReply.stdout);
    await waitForRedis(containerName);
    await runIntegrationTests(`redis://127.0.0.1:${hostPort}`);
  } catch (error) {
    failure = error;
  } finally {
    try {
      await runCommand("docker", ["rm", "--force", containerName], {
        capture: true,
        timeoutMs: DOCKER_COMMAND_TIMEOUT_MS
      });
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
  }

  if (failure) {
    throw failure;
  }
}

async function runIntegrationTests(redisUrl) {
  await runCommand(
    "pnpm",
    [
      "--filter",
      "@sketchcatch/api",
      "exec",
      "tsx",
      "--test",
      "src/live-observations/redis-live-observation-store.integration.ts"
    ],
    {
      env: {
        ...process.env,
        [REDIS_URL_ENV]: redisUrl
      },
      timeoutMs: INTEGRATION_TIMEOUT_MS
    }
  );
}

async function waitForRedis(containerName) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await runCommand("docker", ["exec", containerName, "redis-cli", "ping"], {
        capture: true,
        timeoutMs: DOCKER_COMMAND_TIMEOUT_MS
      });
      if (result.stdout.trim() === "PONG") {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }

  throw lastError ?? new Error("Local Redis 8 container did not become ready");
}

function parsePublishedPort(output) {
  for (const line of output.trim().split(/\r?\n/)) {
    const match = /:(\d+)$/.exec(line.trim());
    const value = match?.[1];
    if (value && Number(value) > 0 && Number(value) <= 65_535) {
      return value;
    }
  }
  throw new Error("Docker did not report the local Redis port");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const capture = options.capture === true;
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    activeChild = child;
    let timedOut = false;
    const timeout =
      typeof options.timeoutMs === "number"
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeoutMs)
        : null;

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.once("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (activeChild === child) {
        activeChild = null;
      }
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (activeChild === child) {
        activeChild = null;
      }
      if (timedOut) {
        reject(new Error(`${command} timed out after ${String(options.timeoutMs)}ms`));
        return;
      }
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }
      const detail = capture && stderr.trim() !== "" ? `: ${stderr.trim()}` : "";
      reject(
        new Error(
          `${command} exited ${signal ? `with signal ${signal}` : `with code ${String(code)}`}${detail}`
        )
      );
    });
  });
}
