import { ArrowLeft, ChevronDown, FileCode2, X } from "lucide-react";
import { TerraformAgentReviewButton } from "./TerraformAgentReviewButton";
import styles from "./TerraformCodeToolbar.module.css";

export type TerraformCodeToolbarState = {
  readonly activeFileName: string;
  readonly canRequestExplanation: boolean;
  readonly explanationLabel: string;
  readonly fileOptions: readonly string[];
  readonly fileSearchQuery: string;
  readonly inspectedResourceLabel: string;
  readonly isFileMenuOpen: boolean;
  readonly isResourceCodeMode: boolean;
};

export type TerraformCodeToolbarActions = {
  readonly closeResourceCode: () => void;
  readonly requestExplanation: () => void;
  readonly searchFiles: (query: string) => void;
  readonly selectFile: (fileName: string) => void;
  readonly toggleFileMenu: () => void;
};

// 전체 파일 모드와 선택한 Resource 코드 모드에 맞는 Terraform 상단 도구를 보여줍니다.
export function TerraformCodeToolbar({
  actions,
  state
}: {
  readonly actions: TerraformCodeToolbarActions;
  readonly state: TerraformCodeToolbarState;
}) {
  if (state.isResourceCodeMode) {
    return (
      <>
        <header className={styles.resourceCodeHeader}>
          <div className={styles.resourceCodeTitle}>
            <button
              aria-label="전체 Terraform 코드로 돌아가기"
              className={styles.resourceCodeBackButton}
              onClick={actions.closeResourceCode}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={18} />
            </button>
            <span>{state.inspectedResourceLabel}</span>
          </div>
          <button
            aria-label="Resource 코드 닫기"
            className={styles.resourceCodeCloseButton}
            onClick={actions.closeResourceCode}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className={styles.resourceActionBar}>
          <TerraformAgentReviewButton
            disabled={!state.canRequestExplanation}
            onRequest={actions.requestExplanation}
            title={state.explanationLabel}
          />
        </div>
      </>
    );
  }

  return (
    <header className={styles.terraformTopBar}>
      <div className={styles.terraformFileContext}>
        <span className={styles.terraformToolbarLabel}>Terraform preview</span>
        <div className={styles.terraformFilePicker}>
          <button
            aria-expanded={state.isFileMenuOpen}
            aria-haspopup="listbox"
            className={styles.terraformFileButton}
            onClick={actions.toggleFileMenu}
            type="button"
          >
            <FileCode2 aria-hidden="true" size={16} />
            <span>{state.activeFileName}</span>
            <ChevronDown aria-hidden="true" size={15} />
          </button>
          {state.isFileMenuOpen ? (
            <div className={styles.terraformFileMenu}>
              <input
                aria-label="Terraform 파일 검색"
                className={styles.terraformFileSearch}
                onChange={(event) => actions.searchFiles(event.currentTarget.value)}
                placeholder="파일 검색"
                value={state.fileSearchQuery}
              />
              <div className={styles.terraformFileList} role="listbox">
                {state.fileOptions.map((fileName) => (
                  <button
                    aria-selected={fileName === state.activeFileName}
                    className={
                      fileName === state.activeFileName
                        ? styles.terraformFileOptionActive
                        : styles.terraformFileOption
                    }
                    key={fileName}
                    onClick={() => actions.selectFile(fileName)}
                    role="option"
                    type="button"
                  >
                    {fileName}
                  </button>
                ))}
                {state.fileOptions.length === 0 ? (
                  <span className={styles.terraformFileEmpty}>일치하는 파일이 없습니다</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.terraformTopActions}>
        <TerraformAgentReviewButton
          disabled={!state.canRequestExplanation}
          onRequest={actions.requestExplanation}
          title={state.explanationLabel}
        />
      </div>
    </header>
  );
}
