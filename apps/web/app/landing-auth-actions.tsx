"use client";

import Link from "next/link";
import { useAuth } from "../components/auth/auth-provider";

type LandingAuthStatus = "loading" | "authenticated" | "unauthenticated";

export function LandingHeaderActions() {
  const { status } = useAuth();

  return <LandingHeaderActionsView status={status} />;
}

export function LandingHeaderActionsView({ status }: { readonly status: LandingAuthStatus }) {
  if (status === "loading") {
    return <div aria-hidden="true" className="headerActions" />;
  }

  return (
    <div className="headerActions">
      <Link className="navButton navButtonSolid" href="/workspace/new">
        새 작업 시작
      </Link>
    </div>
  );
}
