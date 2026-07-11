import Link from "next/link";
import { AuthShell } from "../../../components/auth/auth-shell";
import { PasswordResetConfirmForm } from "./password-reset-confirm-form";

type PasswordResetConfirmPageProps = {
  readonly searchParams?: Promise<{
    readonly token?: string | string[];
  }>;
};

export default async function PasswordResetConfirmPage({
  searchParams
}: PasswordResetConfirmPageProps) {
  const params = await searchParams;
  const token = Array.isArray(params?.token) ? (params.token[0] ?? "") : (params?.token ?? "");

  return (
    <AuthShell
      description="새 비밀번호를 저장하면 기존 로그인 세션은 종료됩니다."
      eyebrow="Password reset"
      footer={
        <p>
          다시 요청해야 하나요? <Link href="/password-reset">재설정 링크 받기</Link>
        </p>
      }
      title="새 비밀번호 설정"
    >
      <PasswordResetConfirmForm initialToken={token} />
    </AuthShell>
  );
}
