"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  filterBoardTemplates,
  getBoardTemplateRelationshipCount,
  getBoardTemplateResourceCount,
  listBoardTemplateTags,
  type BoardTemplate,
  type BoardTemplateSort
} from "../../features/resource-settings/template-library";
import styles from "./TemplateGallery.module.css";
import { createTemplatePreviewModel } from "./template-preview-model";

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
              <option key={templateTag} value={templateTag}>
                {templateTag}
              </option>
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
                      <div>
                        <dt>Resource</dt>
                        <dd>{getBoardTemplateResourceCount(template)}</dd>
                      </div>
                      <div>
                        <dt>관계</dt>
                        <dd>{getBoardTemplateRelationshipCount(template)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className={styles.tags}>
                    {template.tags.map((templateTag) => (
                      <span key={templateTag}>{templateTag}</span>
                    ))}
                  </div>
                  {actionHref ? (
                    <Link className={styles.action} href={actionHref(template)}>
                      {actionLabel}
                      <ArrowRight aria-hidden="true" size={15} />
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

// Template의 실제 node 배치를 아이콘 중심 SVG 미리보기로 축소해 보여줍니다.
function TemplateDiagramPreview({ template }: { readonly template: BoardTemplate }) {
  const model = createTemplatePreviewModel(template.diagramJson);
  const nodesById = new Map(model.nodes.map((node) => [node.id, node]));

  return (
    <div className={styles.preview} aria-label={`${template.title} Architecture 미리보기`}>
      <svg aria-hidden="true" viewBox="0 0 100 60">
        {model.edges.map((edge) => {
          const source = nodesById.get(edge.sourceNodeId);
          const target = nodesById.get(edge.targetNodeId);

          if (!source || !target) return null;

          return (
            <line
              className={styles.previewEdge}
              key={edge.id}
              x1={source.x + source.width / 2}
              x2={target.x + target.width / 2}
              y1={source.y + source.height / 2}
              y2={target.y + target.height / 2}
            />
          );
        })}
        {model.nodes.filter((node) => node.isArea).map((node) => (
          <rect
            className={styles.previewAreaFrame}
            height={node.height}
            key={node.id}
            width={node.width}
            x={node.x}
            y={node.y}
          />
        ))}
        {model.nodes.filter((node) => !node.isArea).map((node) => (
          <g className={styles.previewResource} key={node.id}>
            <rect
              className={styles.previewResourceTile}
              height={node.height}
              rx="1.5"
              width={node.width}
              x={node.x}
              y={node.y}
            />
            {node.iconUrl ? (
              <image
                className={styles.previewResourceIcon}
                height={node.height - 2}
                href={node.iconUrl}
                preserveAspectRatio="xMidYMid meet"
                width={node.width - 2}
                x={node.x + 1}
                y={node.y + 1}
              />
            ) : null}
          </g>
        ))}
      </svg>
      {model.omittedNodeCount > 0 ? (
        <span
          aria-label={`${model.omittedNodeCount}개 노드 생략됨`}
          className={styles.previewOmittedBadge}
        >
          +{model.omittedNodeCount}
        </span>
      ) : null}
    </div>
  );
}
