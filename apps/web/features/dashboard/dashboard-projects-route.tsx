"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { ProjectsClient } from "../../app/projects/projects-client";

export function DashboardProjectsRoute() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderWithControl">
        <div>
          <p className="dashboardEyebrow">Project workspace</p>
          <h1>프로젝트</h1>
          <p>설계한 프로젝트를 확인하고, 이어서 작업하거나 배포 상태를 관리합니다.</p>
        </div>
        <label className="dashboardSearchField">
          <Search aria-hidden="true" size={17} />
          <span className="dashboardVisuallyHidden">프로젝트 검색</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="프로젝트 검색"
            type="search"
            value={searchQuery}
          />
        </label>
      </header>
      <ProjectsClient searchQuery={searchQuery} />
    </div>
  );
}
