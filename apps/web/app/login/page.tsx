import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      description="계정으로 돌아와 이어서 Practice Architecture를 설계하세요."
      eyebrow="Welcome back"
      footer={
        <p>
          계정이 없나요? <Link href="/signup">회원가입</Link>
        </p>
      }
      title="로그인"
    >
      <LoginForm />
    </AuthShell>
  );
}
