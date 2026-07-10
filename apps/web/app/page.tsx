import { RoutePlaceholder } from "../components/runtime/route-placeholder";

export default function HomePage() {
  return (
    <RoutePlaceholder
      description="새 UI를 다시 연결하기 전까지 라우트와 핵심 계약만 노출합니다."
      links={[
        { href: "/workspace/new", label: "새 프로젝트 시작" },
        { href: "/workspace", label: "Workspace 연결부" },
        { href: "/login", label: "로그인" }
      ]}
      title="UI 재구축 준비 상태"
    />
  );
}
