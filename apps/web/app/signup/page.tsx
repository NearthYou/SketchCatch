import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="authPage">
      <div className="authBlueprintShell authBlueprintShellSingle authBlueprintShellWide">
        <section className="authPanel authPanelWide" aria-labelledby="signup-title">
          <Link className="authBrand" href="/">
            <img className="brandLogoImage" src="/sketchcatch-logo.svg" alt="" />
            <span>SketchCatch</span>
          </Link>
          <div className="authIntro">
            <p className="eyebrow">Create account</p>
            <h1 id="signup-title">회원가입</h1>
          </div>

          <SignupForm />

          <p className="authSwitch">
            이미 계정이 있나요? <Link href="/login">로그인</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
