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

  if (status === "authenticated") {
    return (
      <div className="headerActions">
        <Link className="navButton navButtonGhost" href="/mypage">
          마이페이지
        </Link>
      </div>
    );
  }

  return (
    <div className="headerActions">
      <Link className="navButton navButtonGhost" href="/login">
        로그인
      </Link>
      <Link className="navButton navButtonSolid" href="/signup">
        회원가입
      </Link>
    </div>
  );
}
