import Link from "next/link";
import { PasswordResetRequestForm } from "./request-form";

export default function PasswordResetPage() {
  return (
    <main className="authPage">
      <div className="authBlueprintShell authBlueprintShellSingle">
        <section className="authPanel" aria-labelledby="password-reset-title">
          <Link className="authBrand" href="/">
            SketchCatch
          </Link>
          <div className="authIntro">
            <p className="eyebrow">Password reset</p>
            <h1 id="password-reset-title">비밀번호 재설정</h1>
          </div>

          <PasswordResetRequestForm />

          <p className="authSwitch">
            비밀번호가 기억나나요? <Link href="/login">로그인</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
