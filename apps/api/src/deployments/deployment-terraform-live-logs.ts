import type { DeploymentStage } from "@sketchcatch/types";
import {
  clearInterval as clearNodeInterval,
  setInterval as setNodeInterval
} from "node:timers";
import {
  appendDeploymentLogs,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import { appendTerraformDurationLog } from "./deployment-duration-logs.js";
import { maskDeploymentMessage } from "./log-masking.js";
import type { TerraformOutputLine, TerraformRunResult } from "./terraform-runner.js";

const liveLogBatchSize = 5;
const liveLogFlushDelayMs = 500;
const liveLogHeartbeatIntervalMs = 10_000;

function scheduleNodeInterval(
  callback: () => void,
  delayMs: number
): NodeJS.Timeout {
  const timer = setNodeInterval(callback, delayMs);

  if (typeof timer === "number") {
    throw new TypeError("Expected a Node.js interval handle");
  }

  return timer;
}

function cancelNodeInterval(timer: NodeJS.Timeout): void {
  clearNodeInterval(timer);
}

type DeploymentTerraformLiveLogWriterInput = {
  accessContext: ProjectAccessContext;
  deploymentId: string;
  repository: DeploymentRepository;
  sequence: number;
  stage: DeploymentStage;
};

type DeploymentTerraformLiveLogWriterOptions = {
  clearInterval?: (timer: NodeJS.Timeout) => void;
  heartbeatIntervalMs?: number;
  now?: () => number;
  setInterval?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
};

type CompleteTerraformLiveLogsInput = {
  label: string;
  result: TerraformRunResult;
};

export function createDeploymentTerraformLiveLogWriter(
  input: DeploymentTerraformLiveLogWriterInput,
  options: DeploymentTerraformLiveLogWriterOptions = {}
) {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? liveLogHeartbeatIntervalMs;
  const now = options.now ?? Date.now;
  const scheduleInterval = options.setInterval ?? scheduleNodeInterval;
  const cancelInterval = options.clearInterval ?? cancelNodeInterval;
  const startedAtMs = now();
  let lastActivityAtMs = startedAtMs;
  let completed = false;
  let nextSequence = input.sequence;
  let persistedStdoutLineCount = 0;
  let livePersistenceFailed = false;
  const pendingStdoutLines: string[] = [];

  let liveFlushTimer: NodeJS.Timeout | undefined;
  let liveFlushPromise = Promise.resolve();

  function clearLiveFlushTimer(): void {
    if (liveFlushTimer) {
      clearTimeout(liveFlushTimer);
      liveFlushTimer = undefined;
    }
  }

  function flushPendingStdoutLines(): Promise<void> {
    if (pendingStdoutLines.length === 0 || livePersistenceFailed) {
      return liveFlushPromise;
    }

    const batch = pendingStdoutLines.splice(0);
    liveFlushPromise = liveFlushPromise.then(async () => {
      try {
        nextSequence = await appendOutputLines({
          ...input,
          sequence: nextSequence,
          lines: batch,
          level: "INFO"
        });
        persistedStdoutLineCount += batch.length;
      } catch {
        livePersistenceFailed = true;
      }
    });

    return liveFlushPromise;
  }

  function appendHeartbeat(): Promise<void> {
    const heartbeatAtMs = now();

    if (
      completed ||
      livePersistenceFailed ||
      heartbeatAtMs - lastActivityAtMs < heartbeatIntervalMs
    ) {
      return liveFlushPromise;
    }

    lastActivityAtMs = heartbeatAtMs;
    const elapsedSeconds = Math.max(1, Math.floor((heartbeatAtMs - startedAtMs) / 1_000));

    liveFlushPromise = liveFlushPromise.then(async () => {
      try {
        nextSequence = await appendOutputLines({
          ...input,
          sequence: nextSequence,
          lines: [
            `[progress] Terraform ${input.stage} is still running (${elapsedSeconds}s elapsed)`
          ],
          level: "INFO"
        });
      } catch {
        livePersistenceFailed = true;
      }
    });

    return liveFlushPromise;
  }

  function scheduleLiveFlush(): void {
    if (liveFlushTimer || pendingStdoutLines.length === 0) {
      return;
    }

    liveFlushTimer = setTimeout(() => {
      liveFlushTimer = undefined;
      void flushPendingStdoutLines();
    }, liveLogFlushDelayMs);
  }

  const onOutputLine = async (output: TerraformOutputLine): Promise<void> => {
    if (output.stream !== "stdout" || livePersistenceFailed || completed) {
      return;
    }

    const lines = splitOutputLines(output.line);

    if (lines.length === 0) {
      return;
    }
    lastActivityAtMs = now();

    pendingStdoutLines.push(...lines);

    if (pendingStdoutLines.length < liveLogBatchSize) {
      scheduleLiveFlush();
      return;
    }

    clearLiveFlushTimer();
    await flushPendingStdoutLines();
  };

  const heartbeatTimer = scheduleInterval(() => {
    void appendHeartbeat();
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const complete = async ({ label, result }: CompleteTerraformLiveLogsInput): Promise<number> => {
    completed = true;
    cancelInterval(heartbeatTimer);
    clearLiveFlushTimer();
    await flushPendingStdoutLines();
    nextSequence = await appendOutputLines({
      ...input,
      sequence: nextSequence,
      lines: splitOutputLines(result.stdout).slice(persistedStdoutLineCount),
      level: "INFO"
    });
    nextSequence = await appendOutputLines({
      ...input,
      sequence: nextSequence,
      lines: splitOutputLines(result.stderr),
      level: result.exitCode === 0 ? "WARN" : "ERROR"
    });

    return appendTerraformDurationLog({
      ...input,
      sequence: nextSequence,
      label,
      result
    });
  };

  return {
    complete,
    onOutputLine
  };
}

async function appendOutputLines(input: DeploymentTerraformLiveLogWriterInput & {
  level: "INFO" | "WARN" | "ERROR";
  lines: string[];
}): Promise<number> {
  if (input.lines.length === 0) {
    return input.sequence;
  }

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: input.lines.map((line, index) => ({
        sequence: input.sequence + index,
        stage: input.stage,
        level: input.level,
        message: line,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + input.lines.length;
}

function splitOutputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => maskDeploymentMessage(line.trimEnd()))
    .filter((line) => line.length > 0);
}
