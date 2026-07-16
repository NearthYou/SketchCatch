"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { createAppQueryClient, shouldClearQueryCache } from "./create-query-client";

export function AppQueryProvider({ children }: { readonly children: ReactNode }) {
  const { status, user } = useAuth();
  const [queryClient] = useState(createAppQueryClient);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    const nextUserId = user?.id ?? null;

    if (shouldClearQueryCache(previousUserIdRef.current, nextUserId)) {
      queryClient.clear();
    }

    previousUserIdRef.current = nextUserId;
  }, [queryClient, status, user?.id]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
