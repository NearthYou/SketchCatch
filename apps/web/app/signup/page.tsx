import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      brandPlacement="panel"
      centered
      footer={
        <p>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      }
      title="회원가입"
    >
      <SignupForm />
    </AuthShell>
  );
}
