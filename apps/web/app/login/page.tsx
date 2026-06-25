import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="authPage">
      <section className="authPanel" aria-labelledby="login-title">
        <Link className="authBrand" href="/">
          SketchCatch
        </Link>
        <div className="authIntro">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-title">로그인</h1>
          <p>저장된 AWS 실습 프로젝트와 Terraform 검토 흐름으로 돌아갑니다.</p>
        </div>

        <LoginForm />

        <p className="authSwitch">
          계정이 없나요? <Link href="/signup">회원가입</Link>
        </p>
      </section>
    </main>
  );
}
