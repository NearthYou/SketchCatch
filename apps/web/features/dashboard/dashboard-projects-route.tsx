"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { ProjectsClient } from "../../app/projects/projects-client";

export function DashboardProjectsRoute() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderWithControl dashboardPageHeaderCompact">
        <div>
          <h1>내 프로젝트</h1>
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
