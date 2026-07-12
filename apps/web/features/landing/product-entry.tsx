"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { LandingProductSections } from "./landing-product-sections";
import { LandingWorkflowSection } from "./landing-workflow-section";
import { LandingWorkspacePreview } from "./landing-workspace-preview";
import styles from "./product-entry.module.css";

const FLOW_STEPS = [
  "Requirement Input",
  "Architecture Board",
  "IaC Preview",
  "Pre-Deployment Check",
  "Deployment Paths"
] as const;

// 로그인 전 사용자가 제품을 둘러보고 로그인이나 회원가입으로 들어가는 첫 화면입니다.
export function ProductEntry() {
  const router = useRouter();
  const { status } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

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
        <a className={styles.brand} href="#top" aria-label="SketchCatch 홈">
          <Image alt="" className={styles.brandMark} height={24} priority src="/sketchcatch-logo.png" width={16} />
          <span>SketchCatch</span>
        </a>

        <nav
          className={isMenuOpen ? `${styles.siteNav} ${styles.siteNavOpen}` : styles.siteNav}
          aria-label="페이지 이동"
        >
          <a href="#workflow" onClick={() => setIsMenuOpen(false)}>작동 방식</a>
          <a href="#workspace" onClick={() => setIsMenuOpen(false)}>워크스페이스</a>
          <a href="#reverse" onClick={() => setIsMenuOpen(false)}>Reverse Engineering</a>
          <a href="#deployment" onClick={() => setIsMenuOpen(false)}>배포 경로</a>
        </nav>

        <div className={styles.headerActions}>
          <a className={`${styles.button} ${styles.buttonSecondary} ${styles.desktopAction}`} href="#workspace">
            제품 둘러보기
          </a>
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
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowDot} aria-hidden="true" />
              AWS-first · provider-neutral
            </p>
            <h1 id="hero-title">SketchCatch</h1>
            <p className={styles.heroDescription}>
              Practice Architecture를 눈으로 설계하고, IaC Preview와 비용·보안 위험을 확인한 뒤
              배포하세요. 복잡한 Resource 관계를 Architecture Board 한 장에서 시작할 수 있습니다.
            </p>
            <ul className={styles.heroInputs} aria-label="지원하는 시작 방식">
              <li>Text</li>
              <li>Voice</li>
              <li>Source Repository</li>
              <li>Existing cloud</li>
            </ul>
            <div className={styles.heroActions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/signup">
                시작하기
                <span className={styles.buttonIcon} aria-hidden="true">→</span>
              </Link>
              <a className={`${styles.button} ${styles.buttonSecondary}`} href="#workflow">
                흐름 먼저 보기
              </a>
            </div>
          </div>

          <LandingWorkspacePreview />
        </section>

        <section className={styles.flowStrip} id="workflow" aria-label="SketchCatch 작업 흐름">
          <ol className={`${styles.container} ${styles.flowList}`}>
            {FLOW_STEPS.map((step, index) => (
              <li key={step}>
                <span className={styles.flowNumber}>{String(index + 1).padStart(2, "0")}</span>
                {step}
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
            <a className={styles.brand} href="#top">
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
