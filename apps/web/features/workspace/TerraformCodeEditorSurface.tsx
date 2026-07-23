import type {
  CSSProperties,
  KeyboardEventHandler,
  RefObject,
  UIEventHandler
} from "react";
import type {
  TerraformHighlightedLine,
  TerraformHighlightedToken,
  TerraformTokenKind
} from "./terraform-code-highlighting";
import styles from "./TerraformCodeEditorSurface.module.css";

const TERRAFORM_TOKEN_CLASS_NAMES: Record<TerraformTokenKind, string | undefined> = {
  brace: styles.terraformTokenBrace,
  comment: styles.terraformTokenComment,
  identifier: styles.terraformTokenIdentifier,
  keyword: styles.terraformTokenKeyword,
  number: styles.terraformTokenNumber,
  operator: styles.terraformTokenOperator,
  plain: styles.terraformTokenPlain,
  reference: styles.terraformTokenReference,
  string: styles.terraformTokenString
};

export type TerraformCodeEditorState = {
  readonly code: string;
  readonly diagnosticLineNumbers: ReadonlySet<number>;
  readonly highlightedBlockAddress: string | null;
  readonly highlightedBlockStyle: CSSProperties | null;
  readonly highlightedLines: readonly TerraformHighlightedLine[];
  readonly lineNumbers: readonly number[];
  readonly sourceLineHighlightStyle: CSSProperties | null;
  readonly syntaxHighlightStyle: CSSProperties;
};

export type TerraformCodeEditorActions = {
  readonly changeCode: (code: string) => void;
  readonly handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  readonly handleScroll: UIEventHandler<HTMLTextAreaElement>;
};

export type TerraformCodeEditorRefs = {
  readonly lineNumbers: RefObject<HTMLOListElement | null>;
  readonly syntaxHighlight: RefObject<HTMLPreElement | null>;
  readonly textarea: RefObject<HTMLTextAreaElement | null>;
};

// Terraform 코드와 줄 번호, 문법 색상, 오류 위치를 하나의 편집 화면으로 겹쳐 보여줍니다.
export function TerraformCodeEditorSurface({
  actions,
  refs,
  state
}: {
  readonly actions: TerraformCodeEditorActions;
  readonly refs: TerraformCodeEditorRefs;
  readonly state: TerraformCodeEditorState;
}) {
  const handleScroll: UIEventHandler<HTMLTextAreaElement> = (event) => {
    const { scrollLeft, scrollTop } = event.currentTarget;

    if (refs.lineNumbers.current) {
      refs.lineNumbers.current.scrollTop = scrollTop;
    }

    if (refs.syntaxHighlight.current) {
      refs.syntaxHighlight.current.style.transform = `translate3d(${-scrollLeft}px, ${-scrollTop}px, 0)`;
    }

    actions.handleScroll(event);
  };

  return (
    <div className={styles.terraformEditorFrame}>
      <ol ref={refs.lineNumbers} className={styles.terraformLineNumbers} aria-hidden="true">
        {state.lineNumbers.map((lineNumber) => (
          <li
            className={
              state.diagnosticLineNumbers.has(lineNumber)
                ? styles.terraformLineNumberError
                : undefined
            }
            key={lineNumber}
          >
            {lineNumber}
          </li>
        ))}
      </ol>
      <div className={styles.terraformSyntaxHighlightLayer} aria-hidden="true">
        <pre
          ref={refs.syntaxHighlight}
          className={styles.terraformSyntaxHighlightCode}
          style={state.syntaxHighlightStyle}
        >
          {state.highlightedLines.map((line) => (
            <span
              className={
                line.hasDiagnostic
                  ? `${styles.terraformHighlightedLine} ${styles.terraformHighlightedLineError}`
                  : styles.terraformHighlightedLine
              }
              key={line.line}
            >
              {line.tokens.map(renderTerraformToken)}
            </span>
          ))}
        </pre>
      </div>
      <textarea
        ref={refs.textarea}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-label="Terraform 코드"
        className={styles.terraformTextarea}
        onChange={(event) => actions.changeCode(event.currentTarget.value)}
        onKeyDown={actions.handleKeyDown}
        onScroll={handleScroll}
        placeholder="# Board에 Resource를 추가하면 Terraform Preview가 여기에 표시됩니다."
        spellCheck={false}
        value={state.code}
        wrap="off"
      />
      {state.sourceLineHighlightStyle ? (
        <div
          aria-hidden="true"
          className={styles.terraformSourceLineHighlight}
          style={state.sourceLineHighlightStyle}
        />
      ) : null}
      {state.highlightedBlockAddress && state.highlightedBlockStyle ? (
        <div
          aria-label={`${state.highlightedBlockAddress} code block`}
          className={styles.terraformBlockHighlightBox}
          style={state.highlightedBlockStyle}
        />
      ) : null}
    </div>
  );
}

// Terraform 토큰 종류에 맞는 문법 색상 클래스를 붙입니다.
function renderTerraformToken(token: TerraformHighlightedToken, index: number) {
  return (
    <span className={TERRAFORM_TOKEN_CLASS_NAMES[token.kind]} key={`${index}-${token.kind}-${token.text}`}>
      {token.text}
    </span>
  );
}
