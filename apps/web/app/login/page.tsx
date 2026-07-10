import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="authDesignPage">
      <section className="authDesignShell" aria-labelledby="login-title">
        <div className="authDesignPanel">
          <Link className="authDesignBrand" href="/">
            <span>SketchCatch</span>
          </Link>
          <div className="authDesignIntro">
            <p className="authDesignBadge">Terraform-first operations</p>
            <h1 id="login-title">로그인</h1>
            <p>
              Practice Architecture부터 IaC Preview, Pre-Deployment Check까지 승인된 운영 흐름으로
              이어가세요.
            </p>
          </div>

          <LoginForm />

          <p className="authDesignSwitch">
            계정이 없나요? <Link href="/signup">회원가입</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
