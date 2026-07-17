import { useCallback, useEffect, useMemo, useState } from "react";
import type { AwsConnection, Project } from "../../../../packages/types/src";
import { listAwsConnections, listProjects } from "./api";
import { getReverseEngineeringAwsConnectionRecovery } from "./reverse-engineering-aws-connection-readiness";

type RequestState = "idle" | "loading" | "error";

export type UseReverseEngineeringOptionsInput = {
  readonly initialProjectId: string;
  readonly onError: (error: unknown) => void;
};

// 프로젝트와 AWS 연결 목록을 관리하며, 스캔 실행은 검증된 연결로만 제한합니다.
export function useReverseEngineeringOptions({
  initialProjectId,
  onError
}: UseReverseEngineeringOptionsInput) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );

  // 프로젝트와 AWS 연결 목록을 다시 읽고 선택값을 가능한 한 유지합니다.
  const loadOptions = useCallback(async () => {
    const recoveryAwsConnectionId = getRecoveryAwsConnectionIdFromCurrentLocation();
    setLoadState("loading");

    try {
      const [nextProjects, nextAwsConnections] = await Promise.all([
        listProjects(),
        listAwsConnections({ includeUnverified: true })
      ]);

      setProjects(nextProjects);
      setAwsConnections(nextAwsConnections);
      setSelectedProjectId((currentProjectId) => {
        const projectStillExists = nextProjects.some((project) => project.id === currentProjectId);
        return projectStillExists ? currentProjectId : nextProjects[0]?.id ?? initialProjectId;
      });
      setSelectedAwsConnectionId((currentAwsConnectionId) => {
        return (
          getReverseEngineeringAwsConnectionRecovery({
            connections: nextAwsConnections,
            selectedConnectionId: currentAwsConnectionId || recoveryAwsConnectionId
          }).selectedConnectionId ?? ""
        );
      });
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      onError(error);
    }
  }, [initialProjectId, onError]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  return {
    loadOptions,
    loadState,
    awsConnections,
    projects,
    selectedAwsConnectionId,
    selectedProjectId,
    setSelectedAwsConnectionId,
    setSelectedProjectId,
    verifiedAwsConnections
  };
}

export function getReverseEngineeringAwsConnectionIdSearchParam(
  values: readonly string[]
): string {
  if (values.length !== 1) {
    return "";
  }

  return values[0]?.trim() ?? "";
}

function getRecoveryAwsConnectionIdFromCurrentLocation(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const searchParams = new URLSearchParams(window.location.search);
  return getReverseEngineeringAwsConnectionIdSearchParam(
    searchParams.getAll("awsConnectionId")
  );
}
