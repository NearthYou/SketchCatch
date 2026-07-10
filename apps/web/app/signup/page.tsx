import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="authDesignPage">
      <section className="authDesignShell authDesignShellWide" aria-labelledby="signup-title">
        <div className="authDesignPanel authDesignPanelWide">
          <Link className="authDesignBrand" href="/">
            <span>SketchCatch</span>
          </Link>
          <div className="authDesignIntro">
            <p className="authDesignBadge">Terraform-first operations</p>
            <h1 id="signup-title">회원가입</h1>
            <p>
              Practice Architecture부터 IaC Preview, Pre-Deployment Check까지 이어갈 운영 계정을
              만드세요.
            </p>
          </div>

          <SignupForm />

          <p className="authDesignSwitch">
            이미 계정이 있나요? <Link href="/login">로그인</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
