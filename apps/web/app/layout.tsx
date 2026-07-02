import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";
import { AuthProvider } from "../components/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SketchCatch",
  description: "Terraform-first AWS infrastructure learning workspace",
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
