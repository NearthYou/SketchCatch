"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type {
  Deployment,
  Project,
  ProjectDeleteAction,
  ProjectDeletePreview
} from "@sketchcatch/types";
import { MoreHorizontal, Search } from "lucide-react";
import { SelectMenu, type SelectMenuOption } from "../../components/ui/SelectMenu";
import { ApiProjectCard, getWorkspaceHref } from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import { useAuth } from "../../components/auth/auth-provider";
import { invalidateProjectQueries } from "../../components/query/dashboard-query-invalidation";
import { queryKeys } from "../../lib/query-keys";
import {
  approveDeploymentPlan,
  deleteProject,
  getProjectDeletePreview,
  listDeployments,
  runDeploymentDestroy,
  runDeploymentDestroyPlan
} from "../../features/workspace/api";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import {
  getProjectActionMenuItems,
  type ProjectActionMenuItemKind
} from "../../features/projects/project-action-menu";
import {
  getDestroyDeleteAcknowledgedWarningIds,
  getProjectDeleteProgress,
  type ProjectDeleteWorkflowStatus,
  isDestroyPlanReadyForApproval,
  shouldShowProjectOnlyDeleteFallback
} from "../../features/projects/project-delete-flow";
import {
  buildBulkProjectDeletePlan,
  getBulkProjectDeleteProgress,
  type BulkProjectDeletion,
  type BulkProjectDeleteCandidate,
  type BulkProjectDeletePlan
} from "../../features/projects/project-bulk-delete";
import { filterProjectsByName } from "../../features/projects/project-search";
import {
  type ProjectsQueryData,
  removeProjectFromQueryData,
  useProjectsQuery
} from "../../features/projects/projects-query";

const DELETE_DEPLOYMENT_POLL_INTERVAL_MS = 2500;
const DELETE_DEPLOYMENT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const PROJECT_SORT_OPTIONS: SelectMenuOption[] = [
  { label: "최근 작업한 순서", value: "recent_work" },
  { label: "최근 생성한 순서", value: "recent_created" }
];
const PROJECT_DEPLOYMENT_FILTER_OPTIONS: SelectMenuOption[] = [
  { label: "전체", value: "all" },
  { label: "배포됨", value: "deployed" },
  { label: "미배포", value: "not_deployed" }
];

type ProjectDeploymentFilter = "all" | "deployed" | "not_deployed";
type ProjectSortMode = "recent_work" | "recent_created";
type DeleteDialogState =
  | { readonly status: "closed" }
  | {
      readonly project: Project;
      readonly selectedAction?: ProjectDeleteAction | undefined;
      readonly status: "loading";
    }
  | {
      readonly deployment?: Deployment | undefined;
      readonly errorMessage?: string | undefined;
      readonly preview: ProjectDeletePreview;
      readonly project: Project;
      readonly selectedAction?: ProjectDeleteAction | undefined;
      readonly status: "ready" | "planning" | "approving" | "destroying" | "deleting";
    };
type ProjectActionMenuState =
  | { readonly status: "closed" }
  | { readonly project: Project; readonly status: "loading" }
  | { readonly preview: ProjectDeletePreview; readonly project: Project; readonly status: "ready" }
  | { readonly errorMessage: string; readonly project: Project; readonly status: "error" };
type BulkProjectDeleteStep = "destroy_plan" | "approving" | "destroying" | "project_cleanup";
type BulkProjectDeleteDialogState =
  | { readonly status: "closed" }
  | { readonly status: "loading" }
  | { readonly plan: BulkProjectDeletePlan; readonly status: "ready" }
  | {
      readonly completedCount: number;
      readonly currentProjectName: string;
      readonly currentStep: BulkProjectDeleteStep;
      readonly plan: BulkProjectDeletePlan;
      readonly status: "deleting";
    }
  | {
      readonly deletedCount: number;
      readonly failedCount: number;
      readonly failedProjectNames: readonly string[];
      readonly plan: BulkProjectDeletePlan;
      readonly status: "complete";
    };

export function ProjectsClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data?.projects ?? [];
  const deploymentStatusByProjectId = projectsQuery.data?.deploymentStatusByProjectId ?? {};
  const [deploymentFilter, setDeploymentFilter] = useState<ProjectDeploymentFilter>("all");
  const [sortMode, setSortMode] = useState<ProjectSortMode>("recent_work");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ status: "closed" });
  const [deleteProgressClock, setDeleteProgressClock] = useState<{
    readonly elapsedMs: number;
    readonly status: ProjectDeleteWorkflowStatus | null;
  }>({
    elapsedMs: 0,
    status: null
  });
  const deleteProgressStatus =
    deleteDialog.status === "planning" ||
    deleteDialog.status === "approving" ||
    deleteDialog.status === "destroying" ||
    deleteDialog.status === "deleting"
      ? deleteDialog.status
      : null;
  const [projectActionMenu, setProjectActionMenu] = useState<ProjectActionMenuState>({
    status: "closed"
  });
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<BulkProjectDeleteDialogState>({
    status: "closed"
  });
  const isMountedRef = useRef(true);
  const bulkDeleteDialogRef = useRef<HTMLDivElement>(null);
  const isBulkDeleteInFlightRef = useRef(false);
  const isBulkDeletePreflightRef = useRef(false);
  const bulkDeleteTriggerRef = useRef<HTMLButtonElement>(null);
  const previousBulkDeleteDialogStatusRef = useRef<BulkProjectDeleteDialogState["status"]>(
    "closed"
  );
  const isSearchActive = searchQuery.trim().length > 0;
  const sortedProjects = useMemo(
    () => [...projects].sort((left, right) => compareProjectsBySortMode(left, right, sortMode)),
    [projects, sortMode]
  );
  const searchMatchedProjects = useMemo(
    () => (isSearchActive ? filterProjectsByName(sortedProjects, searchQuery) : sortedProjects),
    [isSearchActive, searchQuery, sortedProjects]
  );
  const displayProjects = useMemo(
    () =>
      searchMatchedProjects.filter((project) =>
        matchesDeploymentFilter(project, deploymentFilter, deploymentStatusByProjectId)
      ),
    [deploymentFilter, deploymentStatusByProjectId, searchMatchedProjects]
  );
  const isDeploymentFilterActive = deploymentFilter !== "all";

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (deleteProgressStatus === null) {
      setDeleteProgressClock({ elapsedMs: 0, status: null });
      return;
    }

    const startedAt = Date.now();
    setDeleteProgressClock({ elapsedMs: 0, status: deleteProgressStatus });
    const intervalId = window.setInterval(() => {
      setDeleteProgressClock({
        elapsedMs: Date.now() - startedAt,
        status: deleteProgressStatus
      });
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [deleteProgressStatus]);

  // gg: Move keyboard focus into a newly opened destructive-action dialog exactly once.
  useEffect(() => {
    const previousStatus = previousBulkDeleteDialogStatusRef.current;
    previousBulkDeleteDialogStatusRef.current = bulkDeleteDialog.status;

    if (previousStatus !== "closed" || bulkDeleteDialog.status === "closed") {
      return;
    }

    window.requestAnimationFrame(() => bulkDeleteDialogRef.current?.focus());
  }, [bulkDeleteDialog.status]);

  async function toggleProjectActionMenu(project: Project): Promise<void> {
    if (projectActionMenu.status !== "closed" && projectActionMenu.project.id === project.id) {
      setProjectActionMenu({ status: "closed" });
      return;
    }

    setDeleteErrorMessage("");
    setProjectActionMenu({ project, status: "loading" });

    try {
      const preview = await getProjectDeletePreview(project.id);

      setProjectActionMenu((currentMenu) =>
        currentMenu.status === "loading" && currentMenu.project.id === project.id
          ? {
              preview,
              project,
              status: "ready"
            }
          : currentMenu
      );
    } catch (error) {
      setProjectActionMenu((currentMenu) =>
        currentMenu.status === "loading" && currentMenu.project.id === project.id
          ? {
              errorMessage: getApiErrorMessage(error, "삭제 상태를 확인하지 못했습니다."),
              project,
              status: "error"
            }
          : currentMenu
      );
    }
  }

  function closeProjectActionMenu(): void {
    setProjectActionMenu({ status: "closed" });
  }

  // gg: Update the cached list once after either one or many safe project deletions.
  function removeProjectsFromList(projectIds: readonly string[]): void {
    if (!user || projectIds.length === 0) {
      return;
    }

    const projectIdSet = new Set(projectIds);

    queryClient.setQueryData<ProjectsQueryData>(queryKeys.projects(user.id), (currentData) =>
      currentData
        ? currentData.projects.reduce(
            (nextData, project) =>
              projectIdSet.has(project.id) ? removeProjectFromQueryData(nextData, project.id) : nextData,
            currentData
          )
        : currentData
    );
    void invalidateProjectQueries(queryClient, user.id);
  }

  // gg: Keep the existing one-project delete flow on the shared cache update path.
  function removeProjectFromList(projectId: string): void {
    removeProjectsFromList([projectId]);
  }

  // gg: Read every project one at a time so preflight does not overwhelm the project API.
  async function openBulkProjectDeleteDialog(): Promise<void> {
    if (
      projects.length === 0 ||
      bulkDeleteDialog.status === "loading" ||
      isBulkDeletePreflightRef.current
    ) {
      return;
    }

    isBulkDeletePreflightRef.current = true;
    setDeleteErrorMessage("");
    setBulkDeleteDialog({ status: "loading" });

    try {
      const candidates: BulkProjectDeleteCandidate[] = [];

      for (const project of projects) {
        try {
          candidates.push({
            preview: await getProjectDeletePreview(project.id),
            project,
            status: "ready"
          });
        } catch {
          candidates.push({
            project,
            status: "unavailable"
          });
        }
      }

      if (!isMountedRef.current) {
        return;
      }

      setBulkDeleteDialog({
        plan: buildBulkProjectDeletePlan(candidates),
        status: "ready"
      });
    } finally {
      isBulkDeletePreflightRef.current = false;
    }
  }

  // gg: Keep the dialog progress truthful while each project's AWS and record cleanup advances.
  function updateBulkProjectDeleteProgress(input: {
    readonly completedCount: number;
    readonly currentProjectName: string;
    readonly currentStep: BulkProjectDeleteStep;
    readonly plan: BulkProjectDeletePlan;
  }): void {
    if (!isMountedRef.current) {
      return;
    }

    setBulkDeleteDialog({ ...input, status: "deleting" });
  }

  // gg: Reuse the existing approved destroy flow before removing a deployed project and its AWS resources.
  async function deleteBulkProject(input: {
    readonly candidate: BulkProjectDeletion;
    readonly completedCount: number;
    readonly plan: BulkProjectDeletePlan;
  }): Promise<void> {
    const { candidate, completedCount, plan } = input;

    if (candidate.action === "delete_project") {
      updateBulkProjectDeleteProgress({
        completedCount,
        currentProjectName: candidate.project.name,
        currentStep: "project_cleanup",
        plan
      });
      await deleteProject(candidate.project.id, "delete_project_with_managed_cleanup");
      return;
    }

    const deploymentId = candidate.preview.activeDeploymentId;
    if (!deploymentId) {
      throw new Error("삭제할 AWS Deployment를 찾을 수 없습니다.");
    }

    updateBulkProjectDeleteProgress({
      completedCount,
      currentProjectName: candidate.project.name,
      currentStep: "destroy_plan",
      plan
    });
    await runDeploymentDestroyPlan(deploymentId);
    const destroyPlan = await waitForProjectDeployment({
      checkMounted: () => isMountedRef.current,
      deploymentId,
      failureMessage: "Destroy Plan 생성이 완료되지 않았습니다.",
      isReady: isDestroyPlanReadyForApproval,
      projectId: candidate.project.id,
      timeoutMessage: "Destroy Plan 생성 시간이 초과되었습니다."
    });

    updateBulkProjectDeleteProgress({
      completedCount,
      currentProjectName: candidate.project.name,
      currentStep: "approving",
      plan
    });
    await approveDeploymentPlan(
      destroyPlan.id,
      getDestroyDeleteAcknowledgedWarningIds(destroyPlan)
    );

    updateBulkProjectDeleteProgress({
      completedCount,
      currentProjectName: candidate.project.name,
      currentStep: "destroying",
      plan
    });
    await runDeploymentDestroy(destroyPlan.id);
    await waitForProjectDeployment({
      checkMounted: () => isMountedRef.current,
      deploymentId: destroyPlan.id,
      failureMessage: "AWS 리소스 삭제가 완료되지 않았습니다.",
      isReady: (deployment) => deployment.status === "DESTROYED",
      projectId: candidate.project.id,
      timeoutMessage: "AWS 리소스 삭제 시간이 초과되었습니다."
    });

    updateBulkProjectDeleteProgress({
      completedCount,
      currentProjectName: candidate.project.name,
      currentStep: "project_cleanup",
      plan
    });
    await deleteProject(candidate.project.id, "delete_project_with_managed_cleanup");
  }

  // gg: Delete preflighted projects one at a time so each AWS destruction remains visible and isolated.
  async function confirmBulkProjectDelete(): Promise<void> {
    if (
      bulkDeleteDialog.status !== "ready" ||
      bulkDeleteDialog.plan.deletable.length === 0 ||
      isBulkDeleteInFlightRef.current
    ) {
      return;
    }

    isBulkDeleteInFlightRef.current = true;
    const { plan } = bulkDeleteDialog;
    const deletedProjectIds: string[] = [];
    let failedCount = 0;
    const failedProjectNames: string[] = [];
    updateBulkProjectDeleteProgress({
      completedCount: 0,
      currentProjectName: plan.deletable[0]?.project.name ?? "",
      currentStep: "project_cleanup",
      plan
    });

    try {
      for (const [index, candidate] of plan.deletable.entries()) {
        try {
          await deleteBulkProject({
            candidate,
            completedCount: index,
            plan
          });
          deletedProjectIds.push(candidate.project.id);
        } catch {
          failedCount += 1;
          failedProjectNames.push(candidate.project.name);
        }

        if (!isMountedRef.current) {
          return;
        }

        updateBulkProjectDeleteProgress({
          completedCount: index + 1,
          currentProjectName: candidate.project.name,
          currentStep: "project_cleanup",
          plan,
        });
      }

      removeProjectsFromList(deletedProjectIds);
      setBulkDeleteDialog({
        deletedCount: deletedProjectIds.length,
        failedCount,
        failedProjectNames,
        plan,
        status: "complete"
      });
    } finally {
      isBulkDeleteInFlightRef.current = false;
    }
  }

  // gg: Do not let a user close the bulk dialog while preflight or AWS deletion is active.
  function closeBulkProjectDeleteDialog(): void {
    if (bulkDeleteDialog.status === "loading" || bulkDeleteDialog.status === "deleting") {
      return;
    }

    setBulkDeleteDialog({ status: "closed" });
    window.requestAnimationFrame(() => bulkDeleteTriggerRef.current?.focus());
  }

  async function openProjectDeleteDialog(
    project: Project,
    preview?: ProjectDeletePreview | undefined,
    selectedAction?: ProjectDeleteAction | undefined
  ): Promise<void> {
    setDeleteErrorMessage("");

    if (preview) {
      setDeleteDialog({
        preview,
        project,
        selectedAction,
        status: "ready"
      });
      return;
    }

    setDeleteDialog({ project, selectedAction, status: "loading" });

    try {
      const nextPreview = await getProjectDeletePreview(project.id);

      setDeleteDialog({
        preview: nextPreview,
        project,
        selectedAction,
        status: "ready"
      });
    } catch (error) {
      setDeleteDialog({ status: "closed" });
      setDeleteErrorMessage(getApiErrorMessage(error, "프로젝트 삭제 상태를 확인하지 못했습니다."));
    }
  }

  async function confirmProjectDelete(
    action: "delete_project" | "delete_project_only"
  ): Promise<void> {
    if (deleteDialog.status === "closed" || deleteDialog.status === "loading") {
      return;
    }

    const { preview, project, selectedAction } = deleteDialog;

    setDeleteErrorMessage("");
    setDeletingProjectId(project.id);
    setDeleteDialog({
      preview,
      project,
      selectedAction,
      status: "deleting"
    });

    try {
      await deleteProject(project.id, action);

      removeProjectFromList(project.id);
      setDeleteDialog({ status: "closed" });

    } catch (error) {
      setDeleteDialog({
        errorMessage: getApiErrorMessage(error, "프로젝트를 삭제하지 못했습니다."),
        preview,
        project,
        selectedAction,
        status: "ready"
      });
    } finally {
      if (isMountedRef.current) {
        setDeletingProjectId(null);
      }
    }
  }

  async function startDestroyThenDelete(): Promise<void> {
    if (deleteDialog.status === "closed" || deleteDialog.status === "loading") {
      return;
    }

    const { preview, project, selectedAction } = deleteDialog;

    if (!preview.activeDeploymentId) {
      setDeleteDialog({
        errorMessage: "정리할 Deployment를 찾을 수 없습니다.",
        preview,
        project,
        selectedAction,
        status: "ready"
      });
      return;
    }

    setDeleteErrorMessage("");
    setDeletingProjectId(project.id);
    setDeleteDialog({
      preview,
      project,
      selectedAction,
      status: "planning"
    });

    try {
      await runDeploymentDestroyPlan(preview.activeDeploymentId);
      const deployment = await waitForProjectDeployment({
        checkMounted: () => isMountedRef.current,
        deploymentId: preview.activeDeploymentId,
        failureMessage: "Destroy Plan이 승인 가능한 상태로 완료되지 않았습니다.",
        isReady: isDestroyPlanReadyForApproval,
        projectId: project.id,
        timeoutMessage: "Destroy Plan 생성 시간이 초과되었습니다."
      });

      if (!isMountedRef.current) {
        return;
      }

      await approveDestroyAndDelete({
        deployment,
        preview,
        project,
        selectedAction
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      setDeleteDialog({
        errorMessage: getApiErrorMessage(error, "Destroy Plan을 생성하지 못했습니다."),
        preview,
        project,
        selectedAction,
        status: "ready"
      });
      setDeletingProjectId(null);
    }
  }

  async function approveDestroyAndDelete(input: {
    readonly deployment: Deployment;
    readonly preview: ProjectDeletePreview;
    readonly project: Project;
    readonly selectedAction?: ProjectDeleteAction | undefined;
  }): Promise<void> {
    const { deployment, preview, project, selectedAction } = input;
    let destroyCompleted = false;
    setDeleteDialog({
      deployment,
      preview,
      project,
      selectedAction,
      status: "approving"
    });

    try {
      await approveDeploymentPlan(
        deployment.id,
        getDestroyDeleteAcknowledgedWarningIds(deployment)
      );
      setDeleteDialog({
        deployment,
        preview,
        project,
        selectedAction,
        status: "destroying"
      });

      await runDeploymentDestroy(deployment.id);
      await waitForProjectDeployment({
        checkMounted: () => isMountedRef.current,
        deploymentId: deployment.id,
        failureMessage: "Destroy가 완료되지 않았습니다.",
        isReady: (currentDeployment) => currentDeployment.status === "DESTROYED",
        projectId: project.id,
        timeoutMessage: "Destroy 완료 대기 시간이 초과되었습니다."
      });
      destroyCompleted = true;

      if (!isMountedRef.current) {
        return;
      }

      setDeleteDialog({
        deployment,
        preview,
        project,
        selectedAction,
        status: "deleting"
      });
      await deleteProject(project.id, "delete_project");

      if (!isMountedRef.current) {
        return;
      }

      removeProjectFromList(project.id);
      setDeleteDialog({ status: "closed" });

    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const errorMessage = getApiErrorMessage(
        error,
        "\uB9AC\uC18C\uC2A4 \uD3EC\uD568 \uC0AD\uC81C\uB97C \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
      );

      if (destroyCompleted) {
        try {
          const recoveryPreview = await getProjectDeletePreview(project.id);

          if (!isMountedRef.current) {
            return;
          }

          setDeleteDialog({
            errorMessage,
            preview: recoveryPreview,
            project,
            status: "ready"
          });
          return;
        } catch {
          setDeleteDialog({ status: "closed" });
          setDeleteErrorMessage(errorMessage);
          return;
        }
      }
      setDeleteDialog({
        deployment,
        errorMessage: getApiErrorMessage(error, "리소스 포함 삭제를 완료하지 못했습니다."),
        preview,
        project,
        selectedAction,
        status: "ready"
      });
    } finally {
      if (isMountedRef.current) {
        setDeletingProjectId(null);
      }
    }
  }

  function closeDeleteDialog(): void {
    if (
      deleteDialog.status === "planning" ||
      deleteDialog.status === "approving" ||
      deleteDialog.status === "destroying" ||
      deleteDialog.status === "deleting"
    ) {
      return;
    }

    setDeleteDialog({ status: "closed" });
    setDeletingProjectId(null);
  }

  function renderDeleteDialog() {
    if (deleteDialog.status === "closed") {
      return null;
    }

    const isBusy =
      deleteDialog.status === "loading" ||
      deleteDialog.status === "planning" ||
      deleteDialog.status === "approving" ||
      deleteDialog.status === "destroying" ||
      deleteDialog.status === "deleting";
    const projectName = deleteDialog.project.name;
    const selectedAction = deleteDialog.selectedAction;
    const projectOnlyDeleteFallback =
      deleteDialog.status !== "loading" &&
      shouldShowProjectOnlyDeleteFallback({
        errorMessage: deleteDialog.errorMessage,
        preview: deleteDialog.preview,
        selectedAction,
        status: deleteDialog.status
      });
    const shouldShowDeleteAction = (action: ProjectDeleteAction): boolean =>
      deleteDialog.status !== "loading" &&
      deleteDialog.preview.availableActions.includes(action) &&
      (!selectedAction || selectedAction === action);
    const deleteProgressElapsedMs =
      deleteProgressClock.status === deleteProgressStatus ? deleteProgressClock.elapsedMs : 0;

    const progress = deleteProgressStatus
      ? getProjectDeleteProgress(deleteProgressStatus, deleteProgressElapsedMs)
      : null;

    return (
      <div
        aria-labelledby="project-delete-dialog-title"
        aria-modal="true"
        className="projectDeleteDialogOverlay"
        role="dialog"
      >
        <div className="projectDeleteDialog">
          <header className="projectDeleteDialogHeader">
            <div>
              <p className="dashboardPanelKicker">Project deletion</p>
              <h3 id="project-delete-dialog-title">{projectName}</h3>
            </div>
            <button
              aria-label="삭제 창 닫기"
              className="dashboardSecondaryButton projectDeleteDialogIconButton"
              disabled={isBusy}
              onClick={closeDeleteDialog}
              type="button"
            >
              <DashboardIcon name="close" />
            </button>
          </header>

          {deleteDialog.status === "loading" ? (
            <p className="projectDeleteDialogText">프로젝트 삭제 상태를 확인하는 중입니다.</p>
          ) : (
            <>
              <p className="projectDeleteDialogText">{deleteDialog.preview.message}</p>

              {deleteDialog.status === "ready" && shouldShowDeleteAction("destroy_then_delete") ? (
                <div className="projectDeleteDialogConfirmation" role="note">
                  <strong>리소스를 포함해 정말 삭제할까요?</strong>
                  <p>
                    계속하면 Destroy Plan 생성과 승인, 리소스 Destroy, 프로젝트 정리를 자동으로
                    진행합니다. 시작 후에는 취소할 수 없습니다.
                  </p>
                </div>
              ) : null}

              {deleteDialog.preview.activeResourceCount > 0 ? (
                <dl className="projectDeleteDialogFacts">
                  <div>
                    <dt>정리 대상 Deployment</dt>
                    <dd>{deleteDialog.preview.activeDeploymentCount}개</dd>
                  </div>
                  <div>
                    <dt>추적 중인 리소스</dt>
                    <dd>{deleteDialog.preview.activeResourceCount}개</dd>
                  </div>
                </dl>
              ) : null}

              {deleteDialog.status === "approving" && deleteDialog.deployment?.planSummary ? (
                <dl className="projectDeleteDialogFacts">
                  <div>
                    <dt>삭제</dt>
                    <dd>{deleteDialog.deployment.planSummary.deleteCount}개</dd>
                  </div>
                  <div>
                    <dt>교체</dt>
                    <dd>{deleteDialog.deployment.planSummary.replaceCount}개</dd>
                  </div>
                </dl>
              ) : null}

              {deleteDialog.errorMessage ? (
                <p className="dashboardMessage" role="alert">
                  {deleteDialog.errorMessage}
                </p>
              ) : null}

              {progress ? (
                <section aria-live="polite" className="projectDeleteDialogProgress">
                  <header className="projectDeleteDialogProgressHeader">
                    <strong>{progress.label}</strong>
                    <span>{progress.percent}%</span>
                  </header>
                  <div
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress.percent}
                    className="projectDeleteDialogProgressTrack"
                    role="progressbar"
                  >
                    <span style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p>{progress.detail}</p>
                </section>
              ) : null}
            </>
          )}

          <footer className="projectDeleteDialogActions">
            <button
              className="dashboardSecondaryButton"
              disabled={isBusy}
              onClick={closeDeleteDialog}
              type="button"
            >
              취소
            </button>

            {deleteDialog.status === "ready" && shouldShowDeleteAction("delete_project") ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void confirmProjectDelete("delete_project")}
                type="button"
              >
                <DashboardIcon name="trash" />
                <span>프로젝트 삭제</span>
              </button>
            ) : null}

            {deleteDialog.status === "ready" && shouldShowDeleteAction("delete_project_only") ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void confirmProjectDelete("delete_project_only")}
                type="button"
              >
                <DashboardIcon name="trash" />
                <span>프로젝트만 삭제</span>
              </button>
            ) : null}

            {projectOnlyDeleteFallback ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void confirmProjectDelete("delete_project_only")}
                type="button"
              >
                <DashboardIcon name="trash" />
                <span>프로젝트 기록만 삭제</span>
              </button>
            ) : null}

            {deleteDialog.status === "ready" && shouldShowDeleteAction("destroy_then_delete") ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void startDestroyThenDelete()}
                type="button"
              >
                <DashboardIcon name="cloud" />
                <span>리소스 포함 삭제 시작</span>
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    );
  }

  // gg: Keep the confirmation explicit while explaining exactly which projects stay untouched.
  function renderBulkProjectDeleteDialog() {
    if (bulkDeleteDialog.status === "closed") {
      return null;
    }

    const isBusy = bulkDeleteDialog.status === "loading" || bulkDeleteDialog.status === "deleting";
    const plan = bulkDeleteDialog.status === "loading" ? null : bulkDeleteDialog.plan;
    const progress =
      bulkDeleteDialog.status === "deleting"
        ? getBulkProjectDeleteProgress({
            completedCount: bulkDeleteDialog.completedCount,
            totalCount: bulkDeleteDialog.plan.deletable.length
          })
        : null;
    const keptProjectCount = plan ? plan.protected.length + plan.unavailable.length : 0;
    const infrastructureDeletionCount =
      plan?.deletable.filter((candidate) => candidate.action === "destroy_then_delete").length ?? 0;
    const directProjectDeletionCount = (plan?.deletable.length ?? 0) - infrastructureDeletionCount;

    // gg: Keep focus in the confirmation and let Escape close it without interrupting an active deletion.
    function handleBulkDeleteDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBulkProjectDeleteDialog();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements.at(-1);

      if (!firstFocusableElement || !lastFocusableElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    }

    return (
      <div
        aria-labelledby="bulk-project-delete-dialog-title"
        aria-modal="true"
        className="projectDeleteDialogOverlay"
        onKeyDown={handleBulkDeleteDialogKeyDown}
        ref={bulkDeleteDialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="projectDeleteDialog">
          <header className="projectDeleteDialogHeader">
            <div>
              <p className="dashboardPanelKicker">내 프로젝트</p>
              <h3 id="bulk-project-delete-dialog-title">전체 프로젝트 삭제</h3>
            </div>
            <button
              aria-label="전체 삭제 창 닫기"
              className="dashboardSecondaryButton projectDeleteDialogIconButton"
              disabled={isBusy}
              onClick={closeBulkProjectDeleteDialog}
              type="button"
            >
              <DashboardIcon name="close" />
            </button>
          </header>

          {bulkDeleteDialog.status === "loading" ? (
            <p className="projectDeleteDialogText">삭제할 수 있는 프로젝트를 확인하는 중입니다.</p>
          ) : null}

          {bulkDeleteDialog.status === "ready" && plan ? (
            <>
              {plan.deletable.length > 0 ? (
                <div className="projectDeleteDialogConfirmation" role="note">
                  <strong>프로젝트 {plan.deletable.length}개와 AWS 인프라를 삭제할까요?</strong>
                  <p>
                    배포된 프로젝트는 Destroy Plan을 만든 뒤 AWS 리소스를 삭제합니다. 프로젝트
                    기록과 SketchCatch가 만든 배포 도구도 함께 정리하며, 시작 후에는 취소할 수
                    없습니다.
                  </p>
                </div>
              ) : (
                <p className="projectDeleteDialogText">
                  현재 자동으로 안전하게 삭제할 수 있는 프로젝트가 없습니다. 배포 중이거나
                  삭제 범위를 확인할 수 없는 프로젝트는 개별 메뉴에서 확인해 주세요.
                </p>
              )}
              <dl className="projectDeleteDialogFacts">
                <div>
                  <dt>AWS 인프라 삭제</dt>
                  <dd>{infrastructureDeletionCount}개</dd>
                </div>
                <div>
                  <dt>프로젝트 정리</dt>
                  <dd>{directProjectDeletionCount}개</dd>
                </div>
                <div>
                  <dt>그대로 유지</dt>
                  <dd>{keptProjectCount}개</dd>
                </div>
              </dl>
              <details className="projectBulkDeleteProjectList">
                <summary>삭제할 프로젝트 {plan.deletable.length}개 보기</summary>
                <ul>
                  {plan.deletable.map((candidate) => (
                    <li key={candidate.project.id}>{candidate.project.name}</li>
                  ))}
                </ul>
              </details>
              {keptProjectCount > 0 ? (
                <details className="projectBulkDeleteProjectList">
                  <summary>그대로 둘 프로젝트 {keptProjectCount}개 보기</summary>
                  {plan.protected.length > 0 ? (
                    <>
                      <p>배포 중이거나 AWS 리소스가 있는 프로젝트</p>
                      <ul>
                        {plan.protected.map((candidate) => (
                          <li key={candidate.project.id}>{candidate.project.name}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {plan.unavailable.length > 0 ? (
                    <>
                      <p>삭제 상태를 확인하지 못한 프로젝트</p>
                      <ul>
                        {plan.unavailable.map((candidate) => (
                          <li key={candidate.project.id}>{candidate.project.name}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </details>
              ) : null}
            </>
          ) : null}

          {bulkDeleteDialog.status === "deleting" && progress ? (
            <section aria-live="polite" className="projectDeleteDialogProgress">
              <header className="projectDeleteDialogProgressHeader">
                <strong>{getBulkProjectDeleteStepLabel(bulkDeleteDialog.currentStep)}</strong>
                <span>
                  {progress.currentCount}/{progress.totalCount}
                </span>
              </header>
              <div
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress.percent}
                className="projectDeleteDialogProgressTrack"
                role="progressbar"
              >
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <p>{bulkDeleteDialog.currentProjectName}</p>
            </section>
          ) : null}

          {bulkDeleteDialog.status === "complete" && plan ? (
            <>
              <p className="projectDeleteDialogText">
                프로젝트 {bulkDeleteDialog.deletedCount}개를 삭제했습니다.
                {bulkDeleteDialog.failedCount > 0
                  ? ` ${bulkDeleteDialog.failedCount}개는 삭제하지 못해 그대로 남았습니다.`
                  : ""}
              </p>
              {bulkDeleteDialog.failedProjectNames.length > 0 ? (
                <details className="projectBulkDeleteProjectList">
                  <summary>
                    삭제하지 못한 프로젝트 {bulkDeleteDialog.failedProjectNames.length}개 보기
                  </summary>
                  <p>개별 메뉴에서 현재 상태를 확인한 뒤 다시 삭제해 주세요.</p>
                  <ul>
                    {bulkDeleteDialog.failedProjectNames.map((projectName, index) => (
                      <li key={`${projectName}-${index}`}>{projectName}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {keptProjectCount > 0 ? (
                <p className="projectDeleteDialogText">
                  배포 중이거나 삭제 범위를 확인할 수 없는 프로젝트 {keptProjectCount}개는
                  건드리지 않았습니다.
                </p>
              ) : null}
            </>
          ) : null}

          <footer className="projectDeleteDialogActions">
            <button
              className="dashboardSecondaryButton"
              disabled={isBusy}
              onClick={closeBulkProjectDeleteDialog}
              type="button"
            >
              {bulkDeleteDialog.status === "complete" ? "닫기" : "취소"}
            </button>
            {bulkDeleteDialog.status === "ready" && plan && plan.deletable.length > 0 ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void confirmBulkProjectDelete()}
                type="button"
              >
                <DashboardIcon name="trash" />
                <span>프로젝트와 AWS 인프라 삭제</span>
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    );
  }

  const isBulkDeleteBusy =
    bulkDeleteDialog.status === "loading" || bulkDeleteDialog.status === "deleting";
  const projectControls = (
    <div className="projectListToolbar">
      <div className="projectListControls" aria-label="프로젝트 검색, 배포 여부 및 정렬">
        <label className="dashboardSearchField">
          <Search aria-hidden="true" size={17} />
          <span className="dashboardVisuallyHidden">프로젝트 검색</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="프로젝트 검색"
            type="search"
            value={searchQuery}
          />
        </label>
        <div className="settingsField projectDeploymentFilterField">
          <span>배포 여부</span>
          <SelectMenu
            ariaLabel="프로젝트 배포 여부 필터 선택"
            emptyLabel="필터 선택"
            onChange={(value) => setDeploymentFilter(value as ProjectDeploymentFilter)}
            options={PROJECT_DEPLOYMENT_FILTER_OPTIONS}
            size="large"
            tone="surface"
            value={deploymentFilter}
          />
        </div>
        <div className="settingsField projectSortField">
          <span>정렬</span>
          <SelectMenu
            ariaLabel="프로젝트 정렬 선택"
            emptyLabel="정렬 선택"
            onChange={(value) => setSortMode(value as ProjectSortMode)}
            options={PROJECT_SORT_OPTIONS}
            size="large"
            tone="surface"
            value={sortMode}
          />
        </div>
      </div>
      <button
        className="dashboardDangerButton projectListBulkDeleteButton"
        disabled={projects.length === 0 || isBulkDeleteBusy}
        onClick={() => void openBulkProjectDeleteDialog()}
        ref={bulkDeleteTriggerRef}
        type="button"
      >
        <DashboardIcon name="trash" />
        <span>전체 삭제</span>
      </button>
    </div>
  );

  if (projectsQuery.isPending) {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 로딩">
        {projectControls}
        <p className="workspaceStateText">프로젝트 목록을 불러오는 중입니다.</p>
      </section>
    );
  }

  if (projectsQuery.isError && !projectsQuery.data) {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 오류">
        {projectControls}
        <p className="dashboardMessage" role="alert">
          {getApiErrorMessage(projectsQuery.error, "프로젝트 목록을 불러오지 못했습니다.")}
        </p>
        <button onClick={() => void projectsQuery.refetch()} type="button">
          다시 시도
        </button>
      </section>
    );
  }

  return (
    <section className="dashboardPanel" aria-label="프로젝트 목록">
      {projectControls}

      {deleteErrorMessage ? (
        <p className="dashboardMessage" role="alert">
          {deleteErrorMessage}
        </p>
      ) : null}

      {displayProjects.length === 0 && isSearchActive ? (
        <div className="projectListEmpty">
          <p>일치하는 프로젝트가 없습니다.</p>
          <Link className="dashboardSecondaryButton" href="/dashboard/projects">
            <DashboardIcon name="close" />
            <span>검색 해제</span>
          </Link>
        </div>
      ) : displayProjects.length === 0 ? (
        <div className="projectListEmpty">
          {isDeploymentFilterActive ? (
            <p>조건에 맞는 프로젝트가 없습니다.</p>
          ) : (
            <p>아직 생성한 프로젝트가 없습니다.</p>
          )}
        </div>
      ) : (
        <div className="dashboardCardGrid">
          {displayProjects.map((project) => (
            <ApiProjectCard
              actions={
                <ProjectCardActionMenu
                  isDeleting={deletingProjectId === project.id}
                  menuState={
                    projectActionMenu.status !== "closed" &&
                    projectActionMenu.project.id === project.id
                      ? projectActionMenu
                      : { status: "closed" }
                  }
                  onClose={closeProjectActionMenu}
                  onDeleteAction={(preview, action) => {
                    closeProjectActionMenu();
                    void openProjectDeleteDialog(project, preview, action);
                  }}
                  onToggle={() => void toggleProjectActionMenu(project)}
                  project={project}
                />
              }
              compactTimestamp={sortMode !== "recent_created"}
              isDeleting={deletingProjectId === project.id}
              key={project.id}
              project={project}
              timestampLabel={
                sortMode === "recent_created" ? "생성" : "마지막으로 작업한 시간:"
              }
              timestampValue={sortMode === "recent_created" ? project.createdAt : project.updatedAt}
              variant="compact"
            />
          ))}
        </div>
      )}

      {renderDeleteDialog()}
      {renderBulkProjectDeleteDialog()}
    </section>
  );
}

function ProjectCardActionMenu({
  isDeleting,
  menuState,
  onClose,
  onDeleteAction,
  onToggle,
  project
}: {
  readonly isDeleting: boolean;
  readonly menuState: ProjectActionMenuState;
  readonly onClose: () => void;
  readonly onDeleteAction: (preview: ProjectDeletePreview, action: ProjectDeleteAction) => void;
  readonly onToggle: () => void;
  readonly project: Project;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOpen = menuState.status !== "closed";
  const menuId = `project-action-menu-${project.id}`;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (
        event.target instanceof Node &&
        menuRef.current &&
        menuRef.current.contains(event.target)
      ) {
        return;
      }

      onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onClose]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    onClose();
  }

  return (
    <div className="projectCardActionMenuWrap" onKeyDown={handleKeyDown} ref={menuRef}>
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${project.name} 프로젝트 메뉴`}
        className="projectCardMenuButton"
        disabled={isDeleting}
        onClick={onToggle}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={20} />
      </button>

      {isOpen ? (
        <div className="projectCardActionMenu" id={menuId} role="menu">
          {menuState.status === "loading" ? (
            <ProjectActionMenuStatus text="삭제 상태 확인 중" />
          ) : null}

          {menuState.status === "error" ? (
            <ProjectActionMenuStatus text={menuState.errorMessage} />
          ) : null}

          {menuState.status === "ready" ? (
            getProjectActionMenuItems(menuState.preview).map((item) => {
              if (!isProjectDeleteAction(item.kind)) {
                return (
                  <ProjectActionMenuEditItem key={item.kind} onClose={onClose} project={project} />
                );
              }

              const deleteAction = item.kind;

              return (
                <ProjectActionMenuDeleteItem
                  disabled={isDeleting || item.disabled}
                  itemKind={deleteAction}
                  key={deleteAction}
                  label={item.label}
                  onClick={() => onDeleteAction(menuState.preview, deleteAction)}
                  title={item.disabled ? menuState.preview.message : undefined}
                />
              );
            })
          ) : (
            <ProjectActionMenuEditItem onClose={onClose} project={project} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function isProjectDeleteAction(kind: ProjectActionMenuItemKind): kind is ProjectDeleteAction {
  return kind !== "edit";
}

function ProjectActionMenuStatus({ text }: { readonly text: string }) {
  return (
    <div aria-live="polite" className="projectCardActionMenuStatus">
      {text}
    </div>
  );
}

function ProjectActionMenuEditItem({
  onClose,
  project
}: {
  readonly onClose: () => void;
  readonly project: Project;
}) {
  return (
    <Link
      className="projectCardActionMenuItem"
      href={getWorkspaceHref(project)}
      onClick={onClose}
      role="menuitem"
    >
      <DashboardIcon name="edit" />
      <span>수정</span>
    </Link>
  );
}

function ProjectActionMenuDeleteItem({
  disabled,
  itemKind,
  label,
  onClick,
  title
}: {
  readonly disabled: boolean;
  readonly itemKind: Exclude<ProjectActionMenuItemKind, "edit">;
  readonly label: string;
  readonly onClick: () => void;
  readonly title?: string | undefined;
}) {
  return (
    <button
      className="projectCardActionMenuItem projectCardActionMenuItemDanger"
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      title={title}
      type="button"
    >
      <DashboardIcon name={itemKind === "destroy_then_delete" ? "cloud" : "trash"} />
      <span>{label}</span>
    </button>
  );
}

// gg: Use short stage names so a long-running bulk deletion explains its current AWS action.
function getBulkProjectDeleteStepLabel(step: BulkProjectDeleteStep): string {
  switch (step) {
    case "destroy_plan":
      return "AWS 삭제 계획을 만드는 중입니다.";
    case "approving":
      return "AWS 삭제 계획을 승인하는 중입니다.";
    case "destroying":
      return "AWS 인프라를 삭제하는 중입니다.";
    case "project_cleanup":
      return "프로젝트 기록을 정리하는 중입니다.";
  }
}

async function waitForProjectDeployment(input: {
  readonly checkMounted?: (() => boolean) | undefined;
  readonly deploymentId: string;
  readonly failureMessage: string;
  readonly isReady: (deployment: Deployment) => boolean;
  readonly projectId: string;
  readonly timeoutMessage: string;
}): Promise<Deployment> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= DELETE_DEPLOYMENT_POLL_TIMEOUT_MS) {
    if (input.checkMounted?.() === false) {
      throw new Error("Deployment polling was cancelled.");
    }

    const deployments = await listDeployments(input.projectId);

    if (input.checkMounted?.() === false) {
      throw new Error("Deployment polling was cancelled.");
    }

    const deployment = deployments.find(
      (candidateDeployment) => candidateDeployment.id === input.deploymentId
    );

    if (!deployment) {
      throw new Error("Deployment를 찾을 수 없습니다.");
    }

    if (input.isReady(deployment)) {
      return deployment;
    }

    if (deployment.status !== "RUNNING") {
      throw new Error(deployment.errorSummary ?? input.failureMessage);
    }

    await sleep(DELETE_DEPLOYMENT_POLL_INTERVAL_MS);
  }

  throw new Error(input.timeoutMessage);
}

function compareProjectsBySortMode(
  left: Project,
  right: Project,
  sortMode: ProjectSortMode
): number {
  const leftDate = sortMode === "recent_created" ? left.createdAt : left.updatedAt;
  const rightDate = sortMode === "recent_created" ? right.createdAt : right.updatedAt;

  return new Date(rightDate).getTime() - new Date(leftDate).getTime();
}

function matchesDeploymentFilter(
  project: Project,
  deploymentFilter: ProjectDeploymentFilter,
  deploymentStatusByProjectId: Readonly<Record<string, boolean>>
): boolean {
  if (deploymentFilter === "all") {
    return true;
  }

  const isDeployed = deploymentStatusByProjectId[project.id] === true;

  return deploymentFilter === "deployed" ? isDeployed : !isDeployed;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
