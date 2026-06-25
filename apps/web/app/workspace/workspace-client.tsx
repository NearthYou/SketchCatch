"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getApiErrorMessage } from "../../lib/api-client";
import { useAuth } from "../../components/auth/auth-provider";

const sections = [
  "Prompt input area placeholder",
  "Architecture board placeholder",
  "Cost and risk panel placeholder",
  "Deployment session panel placeholder"
];

export function WorkspaceClient() {
  const router = useRouter();
  const { logout, status, user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isCheckingSession = status === "loading";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  async function handleLogout(): Promise<void> {
    setErrorMessage(null);

    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그아웃에 실패했습니다."));
    }
  }

  if (isCheckingSession) {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">세션 확인 중</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">로그인 페이지로 이동 중</p>
      </main>
    );
  }

  return (
    <main className="workspaceShell">
      <header className="workspaceTopBar">
        <div>
          <p className="workspaceEyebrow">SketchCatch workspace</p>
          <h1>Workspace</h1>
        </div>
        <div className="workspaceUserPanel">
          <span>{user?.nickname ?? user?.username}</span>
          <button className="workspaceLogout" onClick={handleLogout} type="button">
            로그아웃
          </button>
        </div>
      </header>

      {errorMessage ? (
        <p className="workspaceMessage" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="workspaceGrid">
        {sections.map((section) => (
          <section className="workspacePanel" key={section}>
            <h2>{section}</h2>
          </section>
        ))}
      </div>
    </main>
  );
}
