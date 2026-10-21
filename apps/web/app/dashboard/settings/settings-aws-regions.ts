import type { SelectMenuOption } from "../../../components/ui/SelectMenu";

// gg: 연결 서비스·runtime credential·배포 계약이 서울만 지원하므로 선택지도 같은 범위로 제한합니다.
export const AWS_CONNECTION_REGION_OPTIONS = [
  { label: "서울", value: "ap-northeast-2" }
] as const satisfies readonly SelectMenuOption[];
