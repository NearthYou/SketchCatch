export const DEFAULT_LEFT_PANEL_WIDTH = 346;
export const DEFAULT_RIGHT_PANEL_WIDTH = 440;
export const MIN_LEFT_PANEL_WIDTH = 300;
export const MAX_LEFT_PANEL_WIDTH = 520;
export const MIN_RIGHT_PANEL_WIDTH = 360;
export const MAX_RIGHT_PANEL_WIDTH = 640;

const PANEL_PREFERENCES_STORAGE_KEY = "sketchcatch.diagramEditor.panelPreferences";
const LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY = "sketchcatch.diagramEditor.leftPanelWidth.brainboardV1";
const LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY =
  "sketchcatch.diagramEditor.rightPanelWidth.brainboardV1";

export type WorkspacePanelPreferences = {
  readonly version: 1;
  readonly leftPanelOpen: boolean;
  readonly leftPanelWidth: number;
  readonly rightPanelOpen: boolean;
  readonly rightPanelWidth: number;
};

export const DEFAULT_WORKSPACE_PANEL_PREFERENCES: WorkspacePanelPreferences = {
  version: 1,
  leftPanelOpen: true,
  leftPanelWidth: DEFAULT_LEFT_PANEL_WIDTH,
  rightPanelOpen: true,
  rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH
};

export type InitialWorkspacePanelState = Pick<
  WorkspacePanelPreferences,
  "leftPanelOpen" | "rightPanelOpen"
>;

export function deriveInitialWorkspacePanelState({
  emptyBoardPanelState,
  hasDiagramNodes,
  isCompactViewport
}: {
  readonly emptyBoardPanelState?: InitialWorkspacePanelState | undefined;
  readonly hasDiagramNodes: boolean;
  readonly isCompactViewport: boolean;
}): InitialWorkspacePanelState {
  if (isCompactViewport || hasDiagramNodes) {
    return { leftPanelOpen: false, rightPanelOpen: false };
  }

  return emptyBoardPanelState ?? { leftPanelOpen: true, rightPanelOpen: false };
}

type PanelPreferenceStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
};

export function readWorkspacePanelPreferences(
  storage: PanelPreferenceStorage | null
): WorkspacePanelPreferences {
  if (!storage) {
    return DEFAULT_WORKSPACE_PANEL_PREFERENCES;
  }

  try {
    const stored = storage.getItem(PANEL_PREFERENCES_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);

      if (isVersionOnePreferences(parsed)) {
        return sanitizePreferences(parsed);
      }
    }
  } catch {
    // Fall through to legacy values when the versioned record is unavailable or malformed.
  }

  try {
    return {
      ...DEFAULT_WORKSPACE_PANEL_PREFERENCES,
      leftPanelWidth: readLegacyWidth(
        storage,
        LEGACY_LEFT_PANEL_WIDTH_STORAGE_KEY,
        MIN_LEFT_PANEL_WIDTH,
        MAX_LEFT_PANEL_WIDTH,
        DEFAULT_LEFT_PANEL_WIDTH
      ),
      rightPanelWidth: readLegacyWidth(
        storage,
        LEGACY_RIGHT_PANEL_WIDTH_STORAGE_KEY,
        MIN_RIGHT_PANEL_WIDTH,
        MAX_RIGHT_PANEL_WIDTH,
        DEFAULT_RIGHT_PANEL_WIDTH
      )
    };
  } catch {
    return DEFAULT_WORKSPACE_PANEL_PREFERENCES;
  }
}

export function writeWorkspacePanelPreferences(
  storage: PanelPreferenceStorage | null,
  update: Partial<Omit<WorkspacePanelPreferences, "version">>
): void {
  if (!storage) {
    return;
  }

  try {
    const current = readWorkspacePanelPreferences(storage);
    const next = sanitizePreferences({ ...current, ...update, version: 1 });
    storage.setItem(PANEL_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage availability must not block panel interactions.
  }
}

function isVersionOnePreferences(value: unknown): value is WorkspacePanelPreferences {
  return typeof value === "object" && value !== null && Reflect.get(value, "version") === 1;
}

function sanitizePreferences(value: WorkspacePanelPreferences): WorkspacePanelPreferences {
  return {
    version: 1,
    leftPanelOpen:
      typeof value.leftPanelOpen === "boolean"
        ? value.leftPanelOpen
        : DEFAULT_WORKSPACE_PANEL_PREFERENCES.leftPanelOpen,
    leftPanelWidth: normalizeWidth(
      value.leftPanelWidth,
      MIN_LEFT_PANEL_WIDTH,
      MAX_LEFT_PANEL_WIDTH,
      DEFAULT_LEFT_PANEL_WIDTH
    ),
    rightPanelOpen:
      typeof value.rightPanelOpen === "boolean"
        ? value.rightPanelOpen
        : DEFAULT_WORKSPACE_PANEL_PREFERENCES.rightPanelOpen,
    rightPanelWidth: normalizeWidth(
      value.rightPanelWidth,
      MIN_RIGHT_PANEL_WIDTH,
      MAX_RIGHT_PANEL_WIDTH,
      DEFAULT_RIGHT_PANEL_WIDTH
    )
  };
}

function readLegacyWidth(
  storage: PanelPreferenceStorage,
  key: string,
  min: number,
  max: number,
  fallback: number
): number {
  const stored = storage.getItem(key);
  return stored === null ? fallback : normalizeWidth(Number(stored), min, max, fallback);
}

function normalizeWidth(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}
