"use client";

import { TemplateGallery } from "../templates/TemplateGallery";
import { listBoardTemplates } from "../../features/resource-settings/template-library";
import { createWorkspaceStartTemplateHref } from "../../app/workspace/new/workspace-start-template-flow";

// 내장 Template을 검색하고 새 프로젝트 시작 화면으로 연결합니다.
export function BuiltInTemplateLibrary() {
  const templates = listBoardTemplates();

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div>
          <h1>템플릿</h1>
        </div>
      </header>

      <TemplateGallery
        actionHref={createWorkspaceStartTemplateHref}
        actionLabel="이 Template으로 시작"
        templates={templates}
      />
    </div>
  );
}
