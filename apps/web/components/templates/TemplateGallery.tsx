"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  filterBoardTemplates,
  getBoardTemplateRelationshipCount,
  getBoardTemplateResourceCount,
  isBoardTemplateAvailable,
  type AvailableBoardTemplate,
  type BoardTemplate
} from "../../features/resource-settings/template-library";
import { BoardThumbnailImage } from "../architecture-board/BoardThumbnailImage";
import styles from "./TemplateGallery.module.css";

export type TemplateGalleryProps = {
  readonly actionHref?: ((template: AvailableBoardTemplate) => string) | undefined;
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
  const visibleTemplates = useMemo(
    () => filterBoardTemplates(templates, { query, sort: "recommended", tag: "all" }),
    [query, templates]
  );

  return (
    <section className={styles.gallery} aria-label="Template Gallery">
      <div className={styles.controls}>
        <label className={styles.searchField}>
          <Search aria-hidden="true" size={16} />
          <span className={styles.visuallyHidden}>Template 검색</span>
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="이름 또는 Resource 검색"
            type="search"
            value={query}
          />
        </label>
      </div>

      {visibleTemplates.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>일치하는 Template이 없습니다</strong>
          <span>검색어를 바꿔보세요.</span>
        </div>
      ) : (
        <div className={styles.grid}>
          {visibleTemplates.map((template) => {
            const available = isBoardTemplateAvailable(template);
            const selected = available && template.id === selectedTemplateId;

            return (
              <article
                className={
                  available
                    ? selected
                      ? styles.cardSelected
                      : styles.card
                    : styles.cardUnavailable
                }
                key={template.id}
              >
                <BoardThumbnailImage
                  className={styles.preview}
                  alt={`${template.title} Architecture 미리보기`}
                  src={template.thumbnailSrc ?? null}
                />
                <div className={styles.cardBody}>
                  <div className={styles.cardHeading}>
                    <div>
                      <h2>{template.title}</h2>
                      <p>{template.description}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Resource</dt>
                        <dd>{available ? getBoardTemplateResourceCount(template) : "—"}</dd>
                      </div>
                      <div>
                        <dt>관계</dt>
                        <dd>{available ? getBoardTemplateRelationshipCount(template) : "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className={styles.tags}>
                    {template.tags.map((templateTag) => (
                      <span key={templateTag}>{templateTag}</span>
                    ))}
                  </div>
                  {!available ? (
                    <div className={styles.unavailableAction}>
                      <span>{template.unavailableReason}</span>
                      <button aria-disabled="true" disabled type="button">
                        미리보기만 제공
                      </button>
                    </div>
                  ) : actionHref ? (
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
