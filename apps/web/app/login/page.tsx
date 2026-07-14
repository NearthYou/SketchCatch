import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      brandPlacement="panel"
      centered
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
