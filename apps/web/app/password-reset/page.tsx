import Link from "next/link";
import { AuthBlueprintAside } from "../auth-blueprint-aside";
import { PasswordResetRequestForm } from "./request-form";

export default function PasswordResetPage() {
  return (
    <main className="authPage">
      <div className="authBlueprintShell">
        <section className="authPanel" aria-labelledby="password-reset-title">
          <Link className="authBrand" href="/">
            SketchCatch
          </Link>
          <div className="authIntro">
            <p className="eyebrow">Password reset</p>
            <h1 id="password-reset-title">비밀번호 재설정</h1>
            <p>가입한 이메일로 비밀번호를 다시 설정할 수 있는 링크를 보냅니다.</p>
          </div>

          <PasswordResetRequestForm />

          <p className="authSwitch">
            비밀번호가 기억났나요? <Link href="/login">로그인</Link>
          </p>
        </section>
        <AuthBlueprintAside mode="reset" />
      </div>
    </main>
  );
}
