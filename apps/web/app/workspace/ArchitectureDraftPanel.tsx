type ArchitectureDraftPanelProps = {
  readonly isLoading: boolean;
  readonly onGitHubDraft: () => void;
  readonly onPromptChange: (value: string) => void;
  readonly onPromptDraft: () => void;
  readonly onRepositoryUrlChange: (value: string) => void;
  readonly prompt: string;
  readonly repositoryUrl: string;
};

// Architecture Draft 입력 폼을 분리해 AI workspace가 결과 패널과 요청 상태에만 집중하게 합니다.
export function ArchitectureDraftPanel({
  isLoading,
  onGitHubDraft,
  onPromptChange,
  onPromptDraft,
  onRepositoryUrlChange,
  prompt,
  repositoryUrl
}: ArchitectureDraftPanelProps) {
  return (
    <section className="workspacePanel toolPanel">
      <h2>Architecture Draft</h2>
      <label className="fieldLabel" htmlFor="prompt-input">
        자연어 요청
      </label>
      <textarea
        className="textArea"
        id="prompt-input"
        onChange={(event) => onPromptChange(event.target.value)}
        rows={5}
        value={prompt}
      />

      <button className="primaryButton" disabled={isLoading} onClick={onPromptDraft}>
        자연어 초안 생성
      </button>

      <label className="fieldLabel" htmlFor="github-url-input">
        GitHub public repository URL
      </label>
      <input
        className="textInput"
        id="github-url-input"
        onChange={(event) => onRepositoryUrlChange(event.target.value)}
        placeholder="https://github.com/owner/repo"
        type="url"
        value={repositoryUrl}
      />
      <button
        className="secondaryButton"
        disabled={isLoading || repositoryUrl.trim().length === 0}
        onClick={onGitHubDraft}
      >
        GitHub 초안 생성
      </button>
    </section>
  );
}
