import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  readonly children: ReactNode;
  readonly description?: string;
  readonly eyebrow: string;
  readonly footer?: ReactNode;
  readonly title: string;
  readonly wide?: boolean;
};

export function AuthShell({
  children,
  description,
  eyebrow,
  footer,
  title,
  wide = false
}: AuthShellProps) {
  const headingId = "auth-page-title";

  return (
    <main className={wide ? "authPage authPageWide" : "authPage"}>
      <header className="authTopbar">
        <Link className="authBrand" href="/" aria-label="SketchCatch 홈">
          <Image alt="" height={32} priority src="/sketchcatch-logo.svg" width={36} />
          <span>SketchCatch</span>
        </Link>
      </header>

      <div className="authLayout">
        <section className="authPanel" aria-labelledby={headingId}>
          <div className="authIntro">
            <p className="authEyebrow">{eyebrow}</p>
            <h1 id={headingId}>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {children}
          {footer ? <div className="authSwitch">{footer}</div> : null}
        </section>

        <aside className="authContext" aria-label="SketchCatch 작업 흐름">
          <p className="authContextEyebrow">One workspace</p>
          <h2>생각한 구조를<br />배포 가능한 흐름으로.</h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Practice Architecture</strong>
                <p>Resource와 관계를 Architecture Board에서 설계합니다.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>IaC Preview</strong>
                <p>Terraform 변경 내용을 배포 전에 확인합니다.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Safety Gate</strong>
                <p>비용과 보안 위험을 확인하고 직접 승인합니다.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
