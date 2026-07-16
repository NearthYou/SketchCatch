import type { DiagramJson, ProjectDraft, TerraformSyncFileInput } from "../../../../packages/types/src";

const DATABASE_NAME = "sketchcatch-drafts";
const DATABASE_VERSION = 1;
const PROJECT_DRAFT_STORE = "projectDrafts";
const CLIENT_METADATA_STORE = "clientMetadata";
const WORKSPACE_METADATA_ID = "workspace";

export type WorkspaceCloudPlatform = "aws" | "gcp";

export type WorkspaceClientMetadata = {
  id: typeof WORKSPACE_METADATA_ID;
  workspaceId: string;
  activeProjectId?: string | undefined;
  activeProjectName?: string | undefined;
  cloudPlatform?: WorkspaceCloudPlatform | undefined;
  updatedAt: string;
};

export type LocalProjectDraft = {
  key: string;
  workspaceId: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
  revision: number;
  draftSavedAt: string;
  serverSavedAt?: string | undefined;
  dirty: boolean;
};

export type InitialDiagramChoice = {
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
  source: "server" | "local" | "empty";
};

export function createDraftStorageKey(workspaceId: string, projectId: string): string {
  return `${workspaceId}:${projectId}`;
}

export function createWorkspaceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `workspace-${crypto.randomUUID()}`;
  }

  return `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isWorkspaceCloudPlatform(value: unknown): value is WorkspaceCloudPlatform {
  return value === "aws" || value === "gcp";
}

export function createLocalProjectDraft({
  workspaceId,
  projectId,
  diagramJson,
  terraformFiles,
  previousDraft,
  savedAt
}: {
  workspaceId: string;
  projectId: string;
  diagramJson: DiagramJson;
  terraformFiles?: TerraformSyncFileInput[] | undefined;
  previousDraft?: LocalProjectDraft | null | undefined;
  savedAt: string;
}): LocalProjectDraft {
  return {
    key: createDraftStorageKey(workspaceId, projectId),
    workspaceId,
    projectId,
    diagramJson,
    ...(terraformFiles ? { terraformFiles } : {}),
    revision: (previousDraft?.revision ?? 0) + 1,
    draftSavedAt: savedAt,
    serverSavedAt: previousDraft?.serverSavedAt,
    dirty: true
  };
}

export function markDraftServerSaved(
  localDraft: LocalProjectDraft,
  serverDraft: ProjectDraft
): LocalProjectDraft {
  return {
    ...localDraft,
    diagramJson: serverDraft.diagramJson,
    ...(serverDraft.terraformFiles ? { terraformFiles: serverDraft.terraformFiles } : {}),
    revision: serverDraft.revision,
    serverSavedAt: serverDraft.serverSavedAt,
    dirty: false
  };
}

export function chooseInitialDiagram({
  serverDraft,
  localDraft,
  fallbackDiagram
}: {
  serverDraft: ProjectDraft | null;
  localDraft: LocalProjectDraft | null;
  fallbackDiagram: DiagramJson;
}): InitialDiagramChoice {
  if (serverDraft && localDraft) {
    if (isLocalDraftNewerThanServerDraft(localDraft, serverDraft)) {
      return {
        diagramJson: localDraft.diagramJson,
        ...(localDraft.terraformFiles ? { terraformFiles: localDraft.terraformFiles } : {}),
        source: "local"
      };
    }

    return {
      diagramJson: serverDraft.diagramJson,
      ...(serverDraft.terraformFiles ? { terraformFiles: serverDraft.terraformFiles } : {}),
      source: "server"
    };
  }

  if (serverDraft) {
    return {
      diagramJson: serverDraft.diagramJson,
      ...(serverDraft.terraformFiles ? { terraformFiles: serverDraft.terraformFiles } : {}),
      source: "server"
    };
  }

  if (localDraft) {
    return {
      diagramJson: localDraft.diagramJson,
      ...(localDraft.terraformFiles ? { terraformFiles: localDraft.terraformFiles } : {}),
      source: "local"
    };
  }

  return {
    diagramJson: fallbackDiagram,
    source: "empty"
  };
}

function isLocalDraftNewerThanServerDraft(
  localDraft: LocalProjectDraft,
  serverDraft: ProjectDraft
): boolean {
  const localSavedAt = parseIsoDateTime(localDraft.draftSavedAt);
  const serverSavedAt = parseIsoDateTime(serverDraft.serverSavedAt);

  return localSavedAt !== null && (serverSavedAt === null || localSavedAt > serverSavedAt);
}

export function parseIsoDateTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function readWorkspaceClientMetadata(): Promise<WorkspaceClientMetadata | null> {
  return readRecord<WorkspaceClientMetadata>(CLIENT_METADATA_STORE, WORKSPACE_METADATA_ID);
}

export async function writeWorkspaceClientMetadata(
  metadata: Omit<WorkspaceClientMetadata, "id">
): Promise<WorkspaceClientMetadata> {
  const storedMetadata: WorkspaceClientMetadata = {
    id: WORKSPACE_METADATA_ID,
    ...metadata
  };

  await writeRecord(CLIENT_METADATA_STORE, storedMetadata);
  return storedMetadata;
}

export async function readLocalProjectDraft(
  workspaceId: string,
  projectId: string
): Promise<LocalProjectDraft | null> {
  return readRecord<LocalProjectDraft>(PROJECT_DRAFT_STORE, createDraftStorageKey(workspaceId, projectId));
}

export async function writeLocalProjectDraft(draft: LocalProjectDraft): Promise<void> {
  await writeRecord(PROJECT_DRAFT_STORE, draft);
}

async function readRecord<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDatabase();

  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);

    request.addEventListener("success", () => {
      resolve((request.result as T | undefined) ?? null);
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error(`Failed to read ${storeName}`));
    });
    transaction.addEventListener("complete", () => db.close());
    transaction.addEventListener("abort", () => db.close());
  });
}

async function writeRecord(storeName: string, value: unknown): Promise<void> {
  const db = await openDatabase();

  if (!db) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.addEventListener("complete", () => {
      db.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      db.close();
      reject(transaction.error ?? new Error(`Failed to write ${storeName}`));
    });
    transaction.addEventListener("abort", () => {
      db.close();
      reject(transaction.error ?? new Error(`Aborted writing ${storeName}`));
    });
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PROJECT_DRAFT_STORE)) {
        db.createObjectStore(PROJECT_DRAFT_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(CLIENT_METADATA_STORE)) {
        db.createObjectStore(CLIENT_METADATA_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open workspace database"));
    });
  });
}
