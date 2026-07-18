"use client";

import type { DiagramJson } from "@sketchcatch/types";
import { DiagramEditor } from "../../../features/diagram-editor";
import type { SelectedAssistantOption } from "./selected-option-model";
import { SelectedOptionTrail } from "./selected-option-trail";
import styles from "./workspace-ai.module.css";

/** Compiler Diagram과 대화에서 고른 답변만 읽기 전용으로 보여줍니다. */
export function FinalArchitecturePreview({
  diagram,
  selections
}: {
  readonly diagram: DiagramJson;
  readonly selections: readonly SelectedAssistantOption[];
}) {
  const previewIdentity = JSON.stringify(diagram);

  return (
    <section
      aria-label="아키텍처 미리보기"
      className={styles.previewShell}
      id="final-architecture-preview"
    >
      <div className={styles.previewFrame}>
        <DiagramEditor
          initialDiagram={diagram}
          initialPreviewDiagram={diagram}
          key={previewIdentity}
          mode="viewer"
          panOnScroll={false}
          rightPanel={null}
          showSaveAction={false}
        />
      </div>

      <SelectedOptionTrail compact selections={selections} />
    </section>
  );
}
