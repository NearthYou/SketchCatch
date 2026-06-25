import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="authPage">
      <section className="authPanel authPanelWide" aria-labelledby="signup-title">
        <Link className="authBrand" href="/">
          SketchCatch
        </Link>
        <div className="authIntro">
          <p className="eyebrow">Create account</p>
          <h1 id="signup-title">회원가입</h1>
          <p>AWS 인프라 설계 연습을 프로젝트로 저장하고 안전하게 이어갑니다.</p>
        </div>

        <SignupForm />

        <p className="authSwitch">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </section>
    </main>
  );
}
