import { maskDeploymentMessage } from "../deployments/log-masking.js";

const maxDeveloperErrorLength = 1_200;
const maxCauseDepth = 4;

export function getDeveloperErrorMessage(
  error: unknown,
  stableMessage: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  if (nodeEnv === "production" || nodeEnv === "test") return stableMessage;

  const messages = collectErrorMessages(error);
  if (messages.length === 0) return stableMessage;

  const diagnostic = maskDeploymentMessage(messages.join(" ← 원인: "))
    .replace(/\s+/g, " ")
    .trim();
  return diagnostic.length > maxDeveloperErrorLength
    ? `${diagnostic.slice(0, maxDeveloperErrorLength - 3)}...`
    : diagnostic;
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < maxCauseDepth; depth += 1) {
    if (!(current instanceof Error) || visited.has(current)) break;
    visited.add(current);

    const message = current.message.trim();
    if (message && !messages.includes(message)) messages.push(message);
    current = current.cause;
  }

  return messages;
}
