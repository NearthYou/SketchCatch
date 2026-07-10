"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/auth/auth-provider";

export function WorkspaceAuthGate({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [router, status]);

  if (status === "loading") {
    return <main><p>Checking session</p></main>;
  }

  if (status === "unauthenticated") {
    return <main><p>Redirecting to login</p></main>;
  }

  return <>{children}</>;
}
