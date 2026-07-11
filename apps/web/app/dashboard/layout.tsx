import type { ReactNode } from "react";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import "../../components/dashboard/dashboard-shell.css";
import "../../components/dashboard/dashboard-content.css";
import "../../components/dashboard/dashboard-costs.css";

export default function DashboardLayout({ children }: { readonly children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
