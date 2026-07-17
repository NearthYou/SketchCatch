import { redirect } from "next/navigation";

// 기존 프로젝트 설정 bookmark는 Workspace의 단일 Delivery 관리 화면으로 이어진다.
export default async function ProjectSettingsPage({
  params
}: {
  readonly params: Promise<{ readonly projectId: string }>;
}) {
  const { projectId } = await params;
  const query = new URLSearchParams({ projectId, startMode: "delivery" });
  redirect(`/workspace?${query.toString()}`);
}
