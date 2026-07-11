import type { ReactNode } from "react";
import { ProductBrand } from "../ui/ProductBrand";

type AuthShellProps = {
  readonly children: ReactNode;
  readonly description?: string;
  readonly eyebrow: string;
  readonly footer?: ReactNode;
  readonly title: string;
  readonly wide?: boolean;
};

// 로그인과 가입 화면이 같은 제품 frame과 제목 구조를 사용하게 합니다.
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
        <ProductBrand href="/" />
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
