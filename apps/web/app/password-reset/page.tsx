import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { PasswordResetRequestForm } from "./request-form";

export default function PasswordResetPage() {
  return (
    <AuthShell
      description="가입한 이메일로 재설정 안내를 보내드립니다."
      eyebrow="Password reset"
      footer={
        <p>
          비밀번호가 기억나나요? <Link href="/login">로그인</Link>
        </p>
      }
      title="비밀번호 재설정"
    >
      <PasswordResetRequestForm />
    </AuthShell>
  );
}
