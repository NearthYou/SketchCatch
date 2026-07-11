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
          <Image alt="" height={24} priority src="/sketchcatch-logo.png" width={16} />
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
      </div>
    </main>
  );
}
