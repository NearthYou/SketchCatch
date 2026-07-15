import type { WorkspaceAiChatScope } from "./workspace-ai-chat-conversation";

export class WorkspaceAiChatRequestRegistry {
  readonly #controllers = new Map<WorkspaceAiChatScope, AbortController>();

  begin(scope: WorkspaceAiChatScope): AbortController {
    this.cancel(scope);
    const controller = new AbortController();
    this.#controllers.set(scope, controller);
    return controller;
  }

  cancel(scope: WorkspaceAiChatScope): boolean {
    const controller = this.#controllers.get(scope);
    if (!controller) return false;
    this.#controllers.delete(scope);
    controller.abort();
    return true;
  }

  complete(scope: WorkspaceAiChatScope, controller: AbortController): void {
    if (this.#controllers.get(scope) === controller) {
      this.#controllers.delete(scope);
    }
  }

  cancelAll(): void {
    for (const scope of [...this.#controllers.keys()]) {
      this.cancel(scope);
    }
  }
}

export function isWorkspaceAiChatAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
