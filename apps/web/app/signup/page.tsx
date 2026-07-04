import Link from "next/link";
import { AuthBlueprintAside } from "../auth-blueprint-aside";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="authPage">
      <div className="authBlueprintShell authBlueprintShellWide">
        <section className="authPanel authPanelWide" aria-labelledby="signup-title">
          <Link className="authBrand" href="/">
            SketchCatch
          </Link>
          <div className="authIntro">
            <p className="eyebrow">Create account</p>
            <h1 id="signup-title">회원가입</h1>
            <p>Terraform-first IaC 운영 흐름을 프로젝트로 저장하고 안전하게 이어갑니다.</p>
          </div>

          <SignupForm />

          <p className="authSwitch">
            이미 계정이 있나요? <Link href="/login">로그인</Link>
          </p>
        </section>
        <AuthBlueprintAside mode="signup" />
      </div>
    </main>
  );
}
