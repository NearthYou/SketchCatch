"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Braces, Network, Rocket, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import styles from "./product-entry.module.css";

const PRODUCT_FLOW = [
  {
    description: "연결된 Resource를 설계합니다.",
    icon: Network,
    label: "Architecture Board"
  },
  {
    description: "배포 전 IaC를 확인합니다.",
    icon: Braces,
    label: "IaC Preview"
  },
  {
    description: "비용과 보안 위험을 점검합니다.",
    icon: ShieldCheck,
    label: "Safety Check"
  },
  {
    description: "승인한 변경만 실행합니다.",
    icon: Rocket,
    label: "Deployment"
  }
] as const;

export function ProductEntry() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  if (status !== "unauthenticated") {
    return (
      <main className={styles.sessionState} aria-live="polite">
        <Image alt="" height={38} priority src="/sketchcatch-logo.svg" width={42} />
        <p>{status === "loading" ? "세션을 확인하고 있습니다." : "Dashboard로 이동합니다."}</p>
      </main>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="SketchCatch 홈">
          <Image alt="" height={32} priority src="/sketchcatch-logo.svg" width={36} />
          <span>SketchCatch</span>
        </Link>
        <nav className={styles.nav} aria-label="계정 메뉴">
          <Link className={styles.loginLink} href="/login">
            로그인
          </Link>
          <Link className={styles.headerCta} href="/signup">
            시작하기
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="product-entry-title">
          <p className={styles.eyebrow}>Terraform-first cloud workspace</p>
          <h1 id="product-entry-title">SketchCatch</h1>
          <p className={styles.statement}>설계부터 배포까지, 하나의 작업 흐름으로 확인하세요.</p>
          <p className={styles.summary}>
            Practice Architecture를 눈으로 설계하고, IaC Preview와 배포 전 위험을 확인한 뒤
            승인한 변경만 클라우드에 반영합니다.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/signup">
              새 작업 시작하기
            </Link>
            <p>
              이미 계정이 있다면 <Link href="/login">로그인</Link>
            </p>
          </div>
        </section>

        <section className={styles.flow} aria-labelledby="product-flow-title">
          <div className={styles.flowHeading}>
            <div>
              <p>One workspace</p>
              <h2 id="product-flow-title">Practice Architecture에서 Deployment까지</h2>
            </div>
            <span>사용자 승인 중심</span>
          </div>
          <ol className={styles.flowList}>
            {PRODUCT_FLOW.map((step, index) => {
              const Icon = step.icon;

              return (
                <li key={step.label}>
                  <div className={styles.flowIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
                  <strong>{step.label}</strong>
                  <p>{step.description}</p>
                </li>
              );
            })}
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>SketchCatch</span>
        <p>Practice Architecture를 실제 IaC 흐름으로 연결합니다.</p>
      </footer>
    </div>
  );
}
