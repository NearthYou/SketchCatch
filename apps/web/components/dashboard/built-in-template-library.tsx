import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import { listBoardTemplates } from "../../features/resource-settings/template-library";

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

      <section className="dashboardTemplateGrid" aria-label="내장 Template 목록">
        {templates.map((template) => (
          <article className="dashboardTemplateCard" key={template.id}>
            <div className="dashboardTemplateIcon">
              <Boxes aria-hidden="true" size={22} />
            </div>
            <div>
              <p>{template.tags.join(" · ")}</p>
              <h2>{template.title}</h2>
              <span>{template.description}</span>
            </div>
            <dl>
              <div>
                <dt>Resource</dt>
                <dd>{template.diagramJson.nodes.length}개</dd>
              </div>
              <div>
                <dt>관계</dt>
                <dd>{template.diagramJson.edges.length}개</dd>
              </div>
            </dl>
            <Link href="/workspace/new">
              새 프로젝트에서 선택 <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
