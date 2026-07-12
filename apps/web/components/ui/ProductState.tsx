import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleOff,
  LoaderCircle,
  TriangleAlert
} from "lucide-react";
import type { ReactNode } from "react";
import styles from "./product-ui.module.css";

const STATE_ICONS = {
  blocked: Ban,
  empty: CircleOff,
  error: CircleAlert,
  loading: LoaderCircle,
  success: CheckCircle2,
  waiting: CircleDashed,
  warning: TriangleAlert
} satisfies Record<ProductStateKind, LucideIcon>;

export type ProductStateKind =
  | "blocked"
  | "empty"
  | "error"
  | "loading"
  | "success"
  | "waiting"
  | "warning";

type ProductStateProps = {
  readonly action?: ReactNode;
  readonly compact?: boolean;
  readonly description: string;
  readonly kind: ProductStateKind;
  readonly title: string;
};

// 비동기 작업과 빈 화면의 상태를 같은 문장 구조와 시각 규칙으로 보여줍니다.
export function ProductState({
  action,
  compact = false,
  description,
  kind,
  title
}: ProductStateProps) {
  const Icon = STATE_ICONS[kind];

  return (
    <section
      aria-live={kind === "error" || kind === "blocked" ? "assertive" : "polite"}
      className={styles.state}
      data-compact={compact}
      data-kind={kind}
      role={kind === "error" || kind === "blocked" ? "alert" : "status"}
    >
      <span className={styles.stateIcon}>
        <Icon aria-hidden="true" className={kind === "loading" ? styles.spin : undefined} size={18} />
      </span>
      <div className={styles.stateCopy}>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.stateAction}>{action}</div> : null}
    </section>
  );
}

type StatusBadgeProps = {
  readonly children: ReactNode;
  readonly kind: Exclude<ProductStateKind, "empty" | "loading">;
};

// 표와 요약 카드에서 상태를 색상과 글자로 함께 구분합니다.
export function StatusBadge({ children, kind }: StatusBadgeProps) {
  return (
    <span className={styles.badge} data-kind={kind}>
      {children}
    </span>
  );
}
