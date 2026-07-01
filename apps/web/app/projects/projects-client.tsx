"use client";

import Link from "next/link";
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
import { MoreHorizontal } from "lucide-react";
import { ApiProjectCard, getWorkspaceHref } from "../../components/dashboard/api-project-card";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  approveDeploymentPlan,
  deleteProject,
  getProjectDeletePreview,
  listDeployments,
  listProjects,
  runDeploymentDestroy,
  runDeploymentDestroyPlan
} from "../../features/workspace/api";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import {
  getProjectActionMenuItems,
  type ProjectActionMenuItemKind
} from "../../features/projects/project-action-menu";
import { filterProjectsByName } from "../../features/projects/project-search";

const DELETE_DEPLOYMENT_POLL_INTERVAL_MS = 2500;
const DELETE_DEPLOYMENT_POLL_TIMEOUT_MS = 10 * 60 * 1000;

type ProjectsLoadState = "loading" | "ready" | "error";
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
      readonly status: "ready" | "planning" | "approval" | "destroying" | "deleting";
    };
type ProjectActionMenuState =
  | { readonly status: "closed" }
  | { readonly project: Project; readonly status: "loading" }
  | { readonly preview: ProjectDeletePreview; readonly project: Project; readonly status: "ready" }
  | { readonly errorMessage: string; readonly project: Project; readonly status: "error" };

export function ProjectsClient({ searchQuery }: { readonly searchQuery: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadState, setLoadState] = useState<ProjectsLoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ status: "closed" });
  const [projectActionMenu, setProjectActionMenu] = useState<ProjectActionMenuState>({
    status: "closed"
  });
  const isSearchActive = searchQuery.trim().length > 0;
  const displayProjects = useMemo(
    () => (isSearchActive ? filterProjectsByName(projects, searchQuery) : projects),
    [isSearchActive, projects, searchQuery]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      setLoadState("loading");
      setErrorMessage("");

      try {
        const nextProjects = await listProjects();

        if (cancelled) {
          return;
        }

        setProjects(nextProjects);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(getApiErrorMessage(error, "프로젝트 목록을 불러오지 못했습니다."));
        setLoadState("error");
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

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

  async function confirmProjectDelete(action: "delete_project" | "delete_project_only"): Promise<void> {
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
      const result = await deleteProject(project.id, action);

      setProjects((currentProjects) =>
        currentProjects.filter((currentProject) => currentProject.id !== project.id)
      );
      setDeleteDialog({ status: "closed" });

      if (result.cleanup.failedObjectCount > 0) {
        setDeleteErrorMessage(result.cleanup.message ?? "일부 SketchCatch 산출물 정리에 실패했습니다.");
      }
    } catch (error) {
      setDeleteDialog({
        errorMessage: getApiErrorMessage(error, "프로젝트를 삭제하지 못했습니다."),
        preview,
        project,
        selectedAction,
        status: "ready"
      });
    } finally {
      setDeletingProjectId(null);
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
        deploymentId: preview.activeDeploymentId,
        failureMessage: "Destroy Plan이 승인 가능한 상태로 완료되지 않았습니다.",
        isReady: isDestroyPlanReadyForApproval,
        projectId: project.id,
        timeoutMessage: "Destroy Plan 생성 시간이 초과되었습니다."
      });

      setDeleteDialog({
        deployment,
        preview,
        project,
        selectedAction,
        status: "approval"
      });
    } catch (error) {
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

  async function approveDestroyAndDelete(): Promise<void> {
    if (deleteDialog.status !== "approval" || !deleteDialog.deployment) {
      return;
    }

    const { deployment, preview, project, selectedAction } = deleteDialog;

    setDeleteDialog({
      deployment,
      preview,
      project,
      selectedAction,
      status: "destroying"
    });

    try {
      await approveDeploymentPlan(deployment.id);
      await runDeploymentDestroy(deployment.id);
      await waitForProjectDeployment({
        deploymentId: deployment.id,
        failureMessage: "Destroy가 완료되지 않았습니다.",
        isReady: (currentDeployment) => currentDeployment.status === "DESTROYED",
        projectId: project.id,
        timeoutMessage: "Destroy 완료 대기 시간이 초과되었습니다."
      });

      const result = await deleteProject(project.id, "delete_project");

      setProjects((currentProjects) =>
        currentProjects.filter((currentProject) => currentProject.id !== project.id)
      );
      setDeleteDialog({ status: "closed" });

      if (result.cleanup.failedObjectCount > 0) {
        setDeleteErrorMessage(result.cleanup.message ?? "일부 SketchCatch 산출물 정리에 실패했습니다.");
      }
    } catch (error) {
      setDeleteDialog({
        deployment,
        errorMessage: getApiErrorMessage(error, "리소스 포함 삭제를 완료하지 못했습니다."),
        preview,
        project,
        selectedAction,
        status: "approval"
      });
    } finally {
      setDeletingProjectId(null);
    }
  }

  function closeDeleteDialog(): void {
    if (
      deleteDialog.status === "planning" ||
      deleteDialog.status === "destroying" ||
      deleteDialog.status === "deleting"
    ) {
      return;
    }

    setDeleteDialog({ status: "closed" });
  }

  function renderDeleteDialog() {
    if (deleteDialog.status === "closed") {
      return null;
    }

    const isBusy =
      deleteDialog.status === "loading" ||
      deleteDialog.status === "planning" ||
      deleteDialog.status === "destroying" ||
      deleteDialog.status === "deleting";
    const projectName = deleteDialog.project.name;
    const selectedAction = deleteDialog.selectedAction;
    const shouldShowDeleteAction = (action: ProjectDeleteAction): boolean =>
      deleteDialog.status !== "loading" &&
      deleteDialog.preview.availableActions.includes(action) &&
      (!selectedAction || selectedAction === action);

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

              {deleteDialog.status === "approval" && deleteDialog.deployment?.planSummary ? (
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

              {deleteDialog.status === "planning" ? (
                <p className="projectDeleteDialogText">Destroy Plan을 생성하는 중입니다.</p>
              ) : null}

              {deleteDialog.status === "destroying" ? (
                <p className="projectDeleteDialogText">AWS 리소스를 삭제한 뒤 프로젝트 기록을 삭제하는 중입니다.</p>
              ) : null}

              {deleteDialog.status === "deleting" ? (
                <p className="projectDeleteDialogText">프로젝트 기록을 삭제하는 중입니다.</p>
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

            {deleteDialog.status !== "loading" &&
            shouldShowDeleteAction("delete_project") ? (
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

            {deleteDialog.status !== "loading" &&
            shouldShowDeleteAction("delete_project_only") ? (
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

            {deleteDialog.status !== "loading" &&
            shouldShowDeleteAction("destroy_then_delete") &&
            deleteDialog.status !== "approval" ? (
              <button
                className="dashboardDangerButton"
                disabled={isBusy}
                onClick={() => void startDestroyThenDelete()}
                type="button"
              >
                <DashboardIcon name="cloud" />
                <span>리소스 포함 삭제</span>
              </button>
            ) : null}

            {deleteDialog.status === "approval" ? (
              <button
                className="dashboardDangerButton"
                onClick={() => void approveDestroyAndDelete()}
                type="button"
              >
                <DashboardIcon name="check" />
                <span>Destroy 승인</span>
              </button>
            ) : null}
          </footer>
        </div>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 로딩">
        <p className="workspaceStateText">프로젝트 목록을 불러오는 중입니다.</p>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="dashboardPanel" aria-label="프로젝트 목록 오류">
        <p className="dashboardMessage" role="alert">
          {errorMessage}
        </p>
      </section>
    );
  }

  return (
    <section className="dashboardPanel" aria-labelledby="all-projects-title">
      <div className="dashboardPanelHeader">
        <div>
          <p className="dashboardPanelKicker">All projects</p>
          <h2 id="all-projects-title">내 프로젝트 전부</h2>
        </div>
        <span className="dashboardCountBadge">{displayProjects.length}개</span>
      </div>

      {deleteErrorMessage ? (
        <p className="dashboardMessage" role="alert">
          {deleteErrorMessage}
        </p>
      ) : null}

      {displayProjects.length === 0 && isSearchActive ? (
        <div className="projectListEmpty">
          <p>일치하는 프로젝트가 없습니다.</p>
          <Link className="dashboardSecondaryButton" href="/projects">
            <DashboardIcon name="close" />
            <span>검색 해제</span>
          </Link>
        </div>
      ) : displayProjects.length === 0 ? (
        <div className="projectListEmpty">
          <p>아직 생성한 프로젝트가 없습니다.</p>
          <Link className="dashboardTopbarAction" href="/workspace/new">
            <DashboardIcon name="plus" />
            <span>새 설계 시작</span>
          </Link>
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
              isDeleting={deletingProjectId === project.id}
              key={project.id}
              project={project}
              timestampLabel="수정"
              timestampValue={project.updatedAt}
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

          {menuState.status === "ready"
            ? getProjectActionMenuItems(menuState.preview).map((item) => {
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
            : (
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
  readonly deploymentId: string;
  readonly failureMessage: string;
  readonly isReady: (deployment: Deployment) => boolean;
  readonly projectId: string;
  readonly timeoutMessage: string;
}): Promise<Deployment> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= DELETE_DEPLOYMENT_POLL_TIMEOUT_MS) {
    const deployments = await listDeployments(input.projectId);
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

function isDestroyPlanReadyForApproval(deployment: Deployment): boolean {
  return (
    deployment.currentPlanArtifactId !== null &&
    deployment.currentPlanOperation === "destroy" &&
    deployment.isBlocked &&
    deployment.blockedBy === "missing_approval"
  );
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
