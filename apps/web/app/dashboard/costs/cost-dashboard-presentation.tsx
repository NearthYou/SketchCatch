import type { ReactNode } from "react";
import styles from "../dashboard-tools.module.css";

export function CostMetric({
  icon,
  label,
  value
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return <article className={styles.metricCard}>{icon}<span>{label}</span><strong>{value}</strong></article>;
}

export function formatUsd(amount: number | undefined): string {
  return typeof amount === "number"
    ? new Intl.NumberFormat("ko-KR", { style: "currency", currency: "USD" }).format(amount)
    : "계산 못 함";
}
