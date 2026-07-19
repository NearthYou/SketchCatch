import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "../components/auth/auth.css";
import { AuthProvider } from "../components/auth/auth-provider";
import { PlainTextCopyGuard } from "../components/clipboard/plain-text-copy-guard";
import { DeploymentNotificationCenter } from "../components/notifications/DeploymentNotificationCenter";
import { AppQueryProvider } from "../components/query/app-query-provider";

export const metadata: Metadata = {
  title: "SketchCatch",
  description: "Terraform-first, multi-cloud-ready IaC operations service",
  icons: {
    icon: "/favicon.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <AppQueryProvider>
            <PlainTextCopyGuard />
            <DeploymentNotificationCenter>{children}</DeploymentNotificationCenter>
          </AppQueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
