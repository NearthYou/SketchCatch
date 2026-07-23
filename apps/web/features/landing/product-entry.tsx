"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { LandingProductSections } from "./landing-product-sections";
import { LandingWorkflowSection } from "./landing-workflow-section";
import styles from "./product-entry.module.css";

const FLOW_STEPS = [
  "요구사항 입력",
  "설계 초안 생성",
  "아키텍처 확정",
  "Terraform 미리보기",
  "비용·보안 검토",
  "배포 방식 선택",
  "승인 후 배포"
] as const;

// 로그인 전 사용자가 제품을 둘러보고 로그인으로 들어가는 첫 화면입니다.
export function ProductEntry() {
  const router = useRouter();
  const { status } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  const handleSectionNavigation = (
    event: MouseEvent<HTMLAnchorElement>,
    targetId: string,
    hash: `#${string}`,
    alignment: "center" | "title" = "title"
  ) => {
    const target = document.getElementById(targetId);

    if (!target) return;

    event.preventDefault();
    setIsMenuOpen(false);
    const headerBottom = document
      .querySelector<HTMLElement>('header[aria-label="주요 메뉴"]')
      ?.getBoundingClientRect().bottom ?? 96;
    const targetRect = target.getBoundingClientRect();
    const targetTop = alignment === "center"
      ? window.scrollY + targetRect.top + targetRect.height / 2 - (headerBottom + window.innerHeight) / 2
      : window.scrollY + targetRect.top - headerBottom - 64;

    window.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      top: Math.max(0, targetTop)
    });
    window.history.replaceState(null, "", hash);
  };

  if (status !== "unauthenticated") {
    return (
      <main className={styles.sessionState} aria-live="polite">
        <strong>SketchCatch</strong>
        <p>{status === "loading" ? "세션을 확인하고 있습니다." : "Dashboard로 이동합니다."}</p>
      </main>
    );
  }

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#landing-main">
        본문으로 바로가기
      </a>

      <header className={styles.siteHeader} aria-label="주요 메뉴">
        <a
          className={styles.brand}
          href="#top"
          aria-label="SketchCatch 홈"
          onClick={(event) => handleSectionNavigation(event, "top", "#top")}
        >
          <Image alt="" className={styles.brandMark} height={24} priority src="/sketchcatch-logo.png" width={16} />
          <span>SketchCatch</span>
        </a>

        <nav
          className={isMenuOpen ? `${styles.siteNav} ${styles.siteNavOpen}` : styles.siteNav}
          aria-label="페이지 이동"
        >
          <a
            href="#workflow"
            onClick={(event) => handleSectionNavigation(event, "workflow", "#workflow", "center")}
          >
            서비스 흐름
          </a>
          <a
            href="#workspace"
            onClick={(event) => handleSectionNavigation(event, "workspace-title", "#workspace")}
          >
            설계
          </a>
          <a
            href="#reverse"
            onClick={(event) => handleSectionNavigation(event, "reverse-content", "#reverse", "center")}
          >
            인프라 분석
          </a>
          <a
            href="#deployment"
            onClick={(event) => handleSectionNavigation(event, "deployment-content", "#deployment", "center")}
          >
            배포
          </a>
        </nav>

        <div className={styles.headerActions}>
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/login">
            로그인
          </Link>
          <button
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            className={styles.mobileMenuButton}
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            {isMenuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
          </button>
        </div>
      </header>

      <main id="landing-main">
        <section className={styles.hero} id="top" aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.heroCopy}`}>
            <h1 id="hero-title">SketchCatch</h1>
            <p className={styles.heroDescription}>
              서비스를 설명하면 아키텍처와 Terraform을 만들고, 비용·보안 검토부터 배포까지 한곳에서 이어집니다.
            </p>
            <div className={styles.heroActions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/login">
                설계 시작
                <span className={styles.buttonIcon} aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.flowStrip} id="workflow" aria-label="SketchCatch 작업 흐름">
          <ol className={`${styles.container} ${styles.flowList}`}>
            {FLOW_STEPS.map((step, index) => (
              <li key={step}>
                <span className={styles.flowNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.flowLabel}>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <LandingWorkflowSection />
        <LandingProductSections />
      </main>

      <footer className={styles.siteFooter}>
        <div className={`${styles.container} ${styles.footerLayout}`}>
          <div className={styles.footerBrand}>
            <a
              className={styles.brand}
              href="#top"
              onClick={(event) => handleSectionNavigation(event, "top", "#top")}
            >
              <span>SketchCatch</span>
            </a>
            <p>Practice Architecture to approved Deployment.</p>
          </div>
          <div className={styles.footerMeta}>
            Product preview · 2026<br />Built from the SketchCatch product flow
          </div>
        </div>
      </footer>
    </div>
  );
}
