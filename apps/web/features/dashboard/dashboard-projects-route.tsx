"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ProjectsClient } from "../../app/projects/projects-client";

export function DashboardProjectsRoute() {
  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div>
          <h1>내 프로젝트</h1>
        </div>
        <Link className="dashboardPrimaryAction" href="/workspace/new?fresh=1">
          <Plus aria-hidden="true" size={17} />
          <span>새 프로젝트</span>
        </Link>
      </header>
      <ProjectsClient />
    </div>
  );
}
