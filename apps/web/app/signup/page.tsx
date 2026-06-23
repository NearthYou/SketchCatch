import Link from "next/link";

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

        <form className="authForm authFormGrid">
          <label>
            아이디
            <input autoComplete="username" name="username" placeholder="yoonseo" type="text" />
          </label>
          <label>
            닉네임
            <input autoComplete="nickname" name="nickname" placeholder="ys" type="text" />
          </label>
          <label className="fullField">
            이메일
            <input autoComplete="email" name="email" placeholder="user@example.com" type="email" />
          </label>
          <label>
            비밀번호
            <input
              autoComplete="new-password"
              name="password"
              placeholder="Password"
              type="password"
            />
          </label>
          <label>
            비밀번호 확인
            <input
              autoComplete="new-password"
              name="passwordConfirm"
              placeholder="Password"
              type="password"
            />
          </label>
          <button className="authSubmit fullField" type="submit">
            회원가입
          </button>
        </form>

        <p className="authSwitch">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </section>
    </main>
  );
}
