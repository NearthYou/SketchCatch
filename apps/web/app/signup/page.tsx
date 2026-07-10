import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      description="계정을 만든 뒤 바로 첫 Practice Architecture를 시작할 수 있습니다."
      eyebrow="Create account"
      footer={
        <p>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      }
      title="회원가입"
      wide
    >
      <SignupForm />
    </AuthShell>
  );
}
