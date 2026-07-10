import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import { AuthProvider } from "../components/auth/auth-provider";

export const metadata: Metadata = {
  title: "SketchCatch",
  description: "Terraform-first, multi-cloud-ready IaC operations service",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
