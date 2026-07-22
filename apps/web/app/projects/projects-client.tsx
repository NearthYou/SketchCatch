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
  const isMountedRef = useRef(true);
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

  function removeProjectFromList(projectId: string): void {
    if (!user) {
      return;
    }

    queryClient.setQueryData<ProjectsQueryData>(queryKeys.projects(user.id), (currentData) =>
      currentData ? removeProjectFromQueryData(currentData, projectId) : currentData
    );
    void invalidateProjectQueries(queryClient, user.id);
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

  const projectControls = (
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
            <>
              <p>아직 생성한 프로젝트가 없습니다.</p>
              <Link className="dashboardTopbarAction" href="/workspace/new">
                <DashboardIcon name="plus" />
                <span>새 설계 시작</span>
              </Link>
            </>
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
