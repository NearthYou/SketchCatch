"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  filterBoardTemplates,
  listBoardTemplateTags,
  type BoardTemplate,
  type BoardTemplateSort
} from "../../features/resource-settings/template-library";
import styles from "./TemplateGallery.module.css";

export type TemplateGalleryProps = {
  readonly actionHref?: ((template: BoardTemplate) => string) | undefined;
  readonly actionLabel: string;
  readonly onSelect?: ((templateId: string) => void) | undefined;
  readonly selectedTemplateId?: string | null | undefined;
  readonly templates: readonly BoardTemplate[];
};

// 같은 검색과 미리보기 화면을 Dashboard와 새 프로젝트 선택 화면에 제공합니다.
export function TemplateGallery({
  actionHref,
  actionLabel,
  onSelect,
  selectedTemplateId = null,
  templates
}: TemplateGalleryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BoardTemplateSort>("recommended");
  const [tag, setTag] = useState("all");
  const tags = useMemo(() => listBoardTemplateTags(templates), [templates]);
  const visibleTemplates = useMemo(
    () => filterBoardTemplates(templates, { query, sort, tag }),
    [query, sort, tag, templates]
  );

  return (
    <section className={styles.gallery} aria-label="Template Gallery">
      <div className={styles.controls}>
        <label className={styles.searchField}>
          <Search aria-hidden="true" size={16} />
          <span className={styles.visuallyHidden}>Template 검색</span>
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="이름, Resource, tag 검색"
            type="search"
            value={query}
          />
        </label>
        <label className={styles.selectField}>
          <span>Tag</span>
          <select onChange={(event) => setTag(event.currentTarget.value)} value={tag}>
            <option value="all">전체</option>
            {tags.map((templateTag) => (
              <option key={templateTag} value={templateTag}>{templateTag}</option>
            ))}
          </select>
        </label>
        <label className={styles.selectField}>
          <span>정렬</span>
          <select
            onChange={(event) => setSort(event.currentTarget.value as BoardTemplateSort)}
            value={sort}
          >
            <option value="recommended">추천순</option>
            <option value="name">이름순</option>
            <option value="resources">Resource 많은 순</option>
          </select>
        </label>
      </div>

      {visibleTemplates.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>일치하는 Template이 없습니다</strong>
          <span>검색어나 Tag를 바꿔보세요.</span>
        </div>
      ) : (
        <div className={styles.grid}>
          {visibleTemplates.map((template) => {
            const selected = template.id === selectedTemplateId;

            return (
              <article className={selected ? styles.cardSelected : styles.card} key={template.id}>
                <TemplateDiagramPreview template={template} />
                <div className={styles.cardBody}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h2>{template.title}</h2>
                      <p>{template.description}</p>
                    </div>
                    <dl>
                      <div><dt>Resource</dt><dd>{template.diagramJson.nodes.length}</dd></div>
                      <div><dt>관계</dt><dd>{template.diagramJson.edges.length}</dd></div>
                    </dl>
                  </div>
                  <div className={styles.tags}>
                    {template.tags.map((templateTag) => <span key={templateTag}>{templateTag}</span>)}
                  </div>
                  {actionHref ? (
                    <Link className={styles.action} href={actionHref(template)}>
                      {actionLabel}<ArrowRight aria-hidden="true" size={15} />
                    </Link>
                  ) : (
                    <button
                      aria-pressed={selected}
                      className={selected ? styles.actionSelected : styles.action}
                      onClick={() => onSelect?.(template.id)}
                      type="button"
                    >
                      {selected ? "선택됨" : actionLabel}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Template의 실제 node 위치를 간단한 Architecture 미리보기로 축소해 보여줍니다.
function TemplateDiagramPreview({ template }: { readonly template: BoardTemplate }) {
  const bounds = getTemplateBounds(template);

  return (
    <div className={styles.preview} aria-label={`${template.title} Architecture 미리보기`}>
      <svg aria-hidden="true" viewBox="0 0 100 60">
        {template.diagramJson.edges.map((edge) => {
          const source = template.diagramJson.nodes.find((node) => node.id === edge.sourceNodeId);
          const target = template.diagramJson.nodes.find((node) => node.id === edge.targetNodeId);
          if (!source || !target) return null;
          const sourcePoint = toPreviewPoint(source.position, bounds);
          const targetPoint = toPreviewPoint(target.position, bounds);
          return <line key={edge.id} x1={sourcePoint.x} y1={sourcePoint.y} x2={targetPoint.x} y2={targetPoint.y} />;
        })}
      </svg>
      {template.diagramJson.nodes.map((node) => {
        const point = toPreviewPoint(node.position, bounds);
        return (
          <span
            className={node.kind === "design" ? styles.previewArea : styles.previewNode}
            key={node.id}
            style={{ left: `${point.x}%`, top: `${point.y / 0.6}%` }}
            title={node.label}
          >
            {node.label}
          </span>
        );
      })}
    </div>
  );
}

type TemplateBounds = { readonly minX: number; readonly minY: number; readonly width: number; readonly height: number };

// node 좌표를 미리보기 안의 0~100 범위로 바꾸기 위한 전체 경계를 계산합니다.
function getTemplateBounds(template: BoardTemplate): TemplateBounds {
  const positions = template.diagramJson.nodes.map((node) => node.position);
  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxX = Math.max(...positions.map((position) => position.x));
  const maxY = Math.max(...positions.map((position) => position.y));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// Board 좌표 하나를 미리보기 여백 안의 위치로 바꿉니다.
function toPreviewPoint(
  position: { readonly x: number; readonly y: number },
  bounds: TemplateBounds
): { readonly x: number; readonly y: number } {
  return {
    x: 12 + ((position.x - bounds.minX) / bounds.width) * 76,
    y: 10 + ((position.y - bounds.minY) / bounds.height) * 40
  };
}
