import { RoutePlaceholder } from "../../components/runtime/route-placeholder";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <RoutePlaceholder
      description="회원가입 API와 인증 상태 처리는 유지하고, 새 UI가 연결될 최소 화면만 제공합니다."
      links={[{ href: "/login", label: "로그인" }]}
      title="회원가입"
    >
      <SignupForm />
    </RoutePlaceholder>
  );
}
