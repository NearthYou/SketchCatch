import { useCallback, useEffect, useMemo, useState } from "react";
import type { AwsConnection, Project } from "../../../../packages/types/src";
import { listAwsConnections, listProjects } from "./api";

type RequestState = "idle" | "loading" | "error";

export type UseReverseEngineeringOptionsInput = {
  readonly initialProjectId: string;
  readonly onError: (error: unknown) => void;
};

// 프로젝트와 검증된 AWS 연결 목록을 관리합니다.
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
    setLoadState("loading");

    try {
      const [nextProjects, nextAwsConnections] = await Promise.all([
        listProjects(),
        listAwsConnections()
      ]);
      const nextVerifiedAwsConnections = nextAwsConnections.filter(
        (connection) => connection.status === "verified"
      );

      setProjects(nextProjects);
      setAwsConnections(nextAwsConnections);
      setSelectedProjectId((currentProjectId) => {
        const projectStillExists = nextProjects.some((project) => project.id === currentProjectId);
        return projectStillExists ? currentProjectId : nextProjects[0]?.id ?? initialProjectId;
      });
      setSelectedAwsConnectionId((currentAwsConnectionId) => {
        const connectionStillExists = nextVerifiedAwsConnections.some(
          (connection) => connection.id === currentAwsConnectionId
        );

        return connectionStillExists
          ? currentAwsConnectionId
          : nextVerifiedAwsConnections[0]?.id ?? "";
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
    projects,
    selectedAwsConnectionId,
    selectedProjectId,
    setSelectedAwsConnectionId,
    setSelectedProjectId,
    verifiedAwsConnections
  };
}
