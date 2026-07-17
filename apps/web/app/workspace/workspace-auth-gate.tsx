"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/auth/auth-provider";
import { shouldShowAuthenticatedShellFallback } from "../../components/auth/auth-gate-state";

export function WorkspaceAuthGate({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [router, status]);

  if (shouldShowAuthenticatedShellFallback(status, user !== null)) {
    return (
      <main>
        <p>{status === "loading" ? "Checking session" : "Redirecting to login"}</p>
      </main>
    );
  }

  return <>{children}</>;
}
