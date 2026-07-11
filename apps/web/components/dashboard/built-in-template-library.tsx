"use client";

import { TemplateGallery } from "../templates/TemplateGallery";
import { listBoardTemplates } from "../../features/resource-settings/template-library";

// 내장 Template을 검색하고 새 프로젝트 시작 화면으로 연결합니다.
export function BuiltInTemplateLibrary() {
  const templates = listBoardTemplates();

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Template library</p>
          <h1>Templates</h1>
          <p>Architecture Board에서 사용할 수 있는 내장 Practice Architecture입니다.</p>
        </div>
      </header>

      <p className="dashboardInformationBand" role="status">
        사용자 Template 저장은 아직 연결되지 않았습니다. 아래 목록은 코드에 포함된 내장 Template입니다.
      </p>

      <TemplateGallery
        actionHref={(template) => `/workspace/new?mode=template&templateId=${encodeURIComponent(template.id)}`}
        actionLabel="이 Template으로 시작"
        templates={templates}
      />
    </div>
  );
}
