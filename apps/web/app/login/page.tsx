import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="authPage">
      <div className="authBlueprintShell authBlueprintShellSingle">
        <section className="authPanel" aria-labelledby="login-title">
          <Link className="authBrand" href="/">
            <img className="brandLogoImage" src="/sketchcatch-logo.svg" alt="" />
            <span>SketchCatch</span>
          </Link>
          <div className="authIntro">
            <p className="eyebrow">Welcome back</p>
            <h1 id="login-title">로그인</h1>
          </div>

          <LoginForm />

          <p className="authSwitch">
            계정이 없나요? <Link href="/signup">회원가입</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
