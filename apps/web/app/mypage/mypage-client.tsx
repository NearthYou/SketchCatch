"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

const sections = [
  "Prompt input area placeholder",
  "Architecture board placeholder",
  "Cost and risk panel placeholder",
  "Deployment session panel placeholder"
];

export function MyPageClient() {
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
      setErrorMessage(getApiErrorMessage(error, "Logout failed."));
    }
  }

  if (isCheckingSession) {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">Checking session</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">Redirecting to login</p>
      </main>
    );
  }

  return (
    <main className="workspaceShell">
      <header className="workspaceTopBar">
        <div>
          <p className="workspaceEyebrow">SketchCatch my page</p>
          <h1>My Page</h1>
        </div>
        <div className="workspaceUserPanel">
          <span>{user?.nickname ?? user?.username}</span>
          <button className="workspaceLogout" onClick={handleLogout} type="button">
            Logout
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
