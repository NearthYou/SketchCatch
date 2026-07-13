export type GitHubCallbackAuthDecision =
  | { readonly kind: "invalid" }
  | { readonly kind: "wait" }
  | { readonly kind: "load" }
  | { readonly href: string; readonly kind: "redirect" };

export type GitHubCallbackRepositoryRequest<T> = {
  readonly key: string;
  readonly promise: Promise<T>;
};

export function getOrCreateGitHubCallbackRepositoryRequest<T>(
  current: GitHubCallbackRepositoryRequest<T> | null,
  key: string,
  load: () => Promise<T>
): GitHubCallbackRepositoryRequest<T> {
  if (current?.key === key) {
    return current;
  }

  return { key, promise: load() };
}

export function getGitHubCallbackAuthDecision(input: {
  readonly authStatus: "loading" | "authenticated" | "unauthenticated";
  readonly installationId: string | null;
  readonly returnPath: string;
  readonly state: string | null;
}): GitHubCallbackAuthDecision {
  if (!input.installationId?.trim() || !input.state?.trim()) {
    return { kind: "invalid" };
  }

  if (input.authStatus === "loading") {
    return { kind: "wait" };
  }

  if (input.authStatus === "unauthenticated") {
    return {
      href: `/login?${new URLSearchParams({ returnTo: input.returnPath }).toString()}`,
      kind: "redirect"
    };
  }

  return { kind: "load" };
}
