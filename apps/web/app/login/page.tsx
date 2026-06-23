import Link from "next/link";

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

        <form className="authForm">
          <label>
            아이디
            <input autoComplete="username" name="username" placeholder="yoonseo" type="text" />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="current-password"
              name="password"
              placeholder="Password"
              type="password"
            />
          </label>
          <button className="authSubmit" type="submit">
            로그인
          </button>
        </form>

        <p className="authSwitch">
          계정이 없나요? <Link href="/signup">회원가입</Link>
        </p>
      </section>
    </main>
  );
}
