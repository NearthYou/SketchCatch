import type { DiagramNode } from "@sketchcatch/types";
import { CopyPlus, Edit3, Trash2 } from "lucide-react";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { deleteResourceNode, duplicateResourceNode } from "./resource-workspace-actions";
import styles from "./ResourceCardMenu.module.css";

type ResourceCardMenuProps = {
  readonly context: DiagramEditorPanelContext;
  readonly node: DiagramNode;
  readonly onClose: () => void;
  readonly onEditConfig: () => void;
};

// 선택한 Resource에 적용할 편집, 복제, 삭제 명령만 모아 보여줍니다.
export function ResourceCardMenu({
  context,
  node,
  onClose,
  onEditConfig
}: ResourceCardMenuProps) {
  return (
    <div
      className={styles.resourceCardMenu}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      role="menu"
    >
      <button className={styles.resourceCardMenuItem} onClick={onEditConfig} role="menuitem" type="button">
        <Edit3 size={17} aria-hidden="true" />
        <span>설정 수정</span>
      </button>
      <button
        className={styles.resourceCardMenuItem}
        onClick={() => {
          duplicateResourceNode(context, node);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <CopyPlus size={17} aria-hidden="true" />
        <span>복제</span>
      </button>
      <button
        className={`${styles.resourceCardMenuItem} ${styles.resourceCardMenuDanger}`}
        onClick={() => {
          deleteResourceNode(context, node.id);
          onClose();
        }}
        role="menuitem"
        type="button"
      >
        <Trash2 size={17} aria-hidden="true" />
        <span>삭제</span>
      </button>
    </div>
  );
}
