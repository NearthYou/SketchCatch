import { RoutePlaceholder } from "../../components/runtime/route-placeholder";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <RoutePlaceholder
      description="인증 연결부는 유지하고, 새 UI가 다시 연결될 최소 화면만 제공합니다."
      links={[{ href: "/signup", label: "회원가입" }]}
      title="로그인"
    >
      <LoginForm />
    </RoutePlaceholder>
  );
}
