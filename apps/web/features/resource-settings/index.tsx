"use client";

import {
  Bot,
  Box,
  Boxes,
  Brush,
  ChartLine,
  ChevronDown,
  ChevronUp,
  Component,
  Container,
  Cpu,
  Database,
  Download,
  Grid2X2,
  Grid3X3,
  Archive,
  LayoutGrid,
  Monitor,
  Network,
  PanelLeftClose,
  RadioTower,
  Search,
  Settings,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import type { ResourceArea, ResourceItem } from "../../../../packages/types/src/index";
import { clearActiveResourceDragPayload, writeResourceDragPayload } from "../diagram-editor/diagram-utils";
import {
  defaultResourceCatalogProvider,
  type ResourceCatalogProvider
} from "./catalog-provider";

const areaLabels: Record<ResourceArea, string> = {
  containers: "Containers",
  compute: "Compute",
  network: "Network",
  storage: "Storage",
  database: "Database",
  "security-identity": "Security & Identity",
  tools: "Tools",
  ai: "AI",
  application: "Application",
  other: "Other"
};

type ResourcePanelSectionId =
  | "modules"
  | "design"
  | ResourceArea
  | "analytics"
  | "iot"
  | "brainboard";

type ResourcePanelSection = {
  id: ResourcePanelSectionId;
  label: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  kind: "modules" | "resources" | "brainboard";
};

const resourceSections: ResourcePanelSection[] = [
  { id: "modules", label: "Modules", icon: Component, defaultOpen: true, kind: "modules" },
  { id: "design", label: "Design", icon: Brush, kind: "resources" },
  { id: "containers", label: "Containers", icon: Container, kind: "resources" },
  { id: "compute", label: areaLabels.compute, icon: Cpu, kind: "resources" },
  { id: "network", label: areaLabels.network, icon: Network, kind: "resources" },
  { id: "storage", label: areaLabels.storage, icon: Archive, kind: "resources" },
  { id: "database", label: areaLabels.database, icon: Database, kind: "resources" },
  {
    id: "security-identity",
    label: areaLabels["security-identity"],
    icon: ShieldCheck,
    kind: "resources"
  },
  { id: "tools", label: areaLabels.tools, icon: Settings, kind: "resources" },
  { id: "ai", label: areaLabels.ai, icon: Bot, kind: "resources" },
  { id: "analytics", label: "Analytics", icon: ChartLine, kind: "resources" },
  { id: "application", label: areaLabels.application, icon: Monitor, kind: "resources" },
  { id: "iot", label: "IoT", icon: RadioTower, kind: "resources" },
  { id: "other", label: areaLabels.other, icon: Grid2X2, kind: "resources" },
  { id: "brainboard", label: "Brainboard", icon: Grid3X3, defaultOpen: true, kind: "brainboard" }
];

export type ResourceSettingsPanelProps = {
  catalogProvider?: ResourceCatalogProvider | undefined;
  onCollapse?: (() => void) | undefined;
};

export function ResourceSettingsPanel({
  catalogProvider = defaultResourceCatalogProvider,
  onCollapse
}: ResourceSettingsPanelProps = {}) {
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(resourceSections.map((section) => [section.id, Boolean(section.defaultOpen)]))
  );

  const normalizedSearch = search.trim().toLowerCase();
  const resources = useMemo(() => catalogProvider.listResources(), [catalogProvider]);
  const searchResults = useMemo(
    () =>
      normalizedSearch
        ? resources.filter((item) => item.name.toLowerCase().includes(normalizedSearch))
        : [],
    [normalizedSearch, resources]
  );

  const resourcesBySection = useMemo(() => getResourcesBySection(resources), [resources]);

  const toggleSection = (sectionId: ResourcePanelSectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId]
    }));
  };

  return (
    <aside className="resourcePanel" aria-label="Resource settings panel">
      <div className="resourceTabs">
        <div className="resourceTabGroup" role="tablist" aria-label="Resource panel tabs">
          <button aria-selected="true" className="resourceTabActive" role="tab" type="button">
            Resources
          </button>
          <button aria-selected="false" className="resourceTab" role="tab" type="button">
            Templates
          </button>
        </div>
        <button
          aria-label="Collapse resource panel"
          className="resourcePanelCollapse"
          onClick={onCollapse}
          title="Collapse resource panel"
          type="button"
        >
          <PanelLeftClose aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="resourceControlBar">
        <div className="providerControls">
          <button className="providerSelect" type="button" aria-label="AWS fixed provider">
            <AwsLogo />
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          <button className="providerSelect providerVersionSelect" type="button" aria-label="Terraform AWS provider version">
            <span>6.47.0</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </div>
        <div className="resourceViewToggles" aria-label="Resource view mode">
          <button aria-pressed="true" className="resourceViewToggleActive" type="button" title="Resources">
            <Box aria-hidden="true" size={20} />
          </button>
          <button aria-pressed="false" className="resourceViewToggle" type="button" title="Modules">
            <Boxes aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <label className="searchBox">
        <Search size={18} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search TF resources"
          aria-label="Search resources by name"
        />
      </label>

      {normalizedSearch ? (
        <div className="resourceSearchResults">
          <p className="sectionCaption">Search results</p>
          {searchResults.length > 0 ? (
            <div className="resourceGrid">
              {searchResults.map((item) => (
                <ResourceTile item={item} key={item.id} search={search} />
              ))}
            </div>
          ) : (
            <div className="emptyPanelState">No resources found.</div>
          )}
        </div>
      ) : (
        <div className="resourceAreas">
          {resourceSections.map((section) => (
            <ResourceSection
              isOpen={Boolean(openSections[section.id])}
              items={resourcesBySection.get(section.id) ?? []}
              key={section.id}
              onToggle={() => toggleSection(section.id)}
              section={section}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function ResourceSection({
  isOpen,
  items,
  onToggle,
  section
}: {
  isOpen: boolean;
  items: readonly ResourceItem[];
  onToggle: () => void;
  section: ResourcePanelSection;
}) {
  const SectionIcon = section.icon;

  return (
    <section className="resourceArea">
      <button
        aria-expanded={isOpen}
        className="resourceAreaHeader"
        onClick={onToggle}
        type="button"
      >
        <span className="resourceAreaIcon" aria-hidden="true">
          <SectionIcon size={22} strokeWidth={2.1} />
        </span>
        <span className="resourceAreaLabel">{section.label}</span>
        {isOpen ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
      </button>

      {isOpen && section.kind === "modules" ? <ModulesEmptyState /> : null}

      {isOpen && section.kind === "resources" ? (
        <div className="resourceSectionBody">
          {items.length > 0 ? (
            <div className="resourceGrid">
              {items.map((item) => (
                <ResourceTile item={item} key={item.id} search="" />
              ))}
            </div>
          ) : (
            <div className="emptyPanelState">No resources found.</div>
          )}
        </div>
      ) : null}

      {isOpen && section.kind === "brainboard" ? (
        <div className="resourceSectionBody">
          <button className="brainboardTile" type="button" title="Custom Terraform block">
            <img alt="" src="/terraform.svg" draggable={false} />
            <span>Custo...</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ModulesEmptyState() {
  return (
    <div className="modulesEmptyState">
      <h3>No modules found</h3>
      <p>Import your modules or pick from our catalog</p>
      <div className="modulesActions">
        <button className="modulesImportButton" type="button">
          <Download aria-hidden="true" size={16} />
          <span>Import</span>
        </button>
        <button className="modulesCatalogButton" type="button">
          <LayoutGrid aria-hidden="true" size={16} />
          <span>Catalog</span>
        </button>
      </div>
    </div>
  );
}

function ResourceTile({ item, search }: { item: ResourceItem; search: string }) {
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!item.enabled) {
      event.preventDefault();
      return;
    }

    writeResourceDragPayload(event.dataTransfer, item);
  };

  return (
    <div
      className={`resourceTile ${item.enabled ? "" : "resourceTileDisabled"}`}
      draggable={item.enabled}
      onDragEnd={clearActiveResourceDragPayload}
      onDragStart={onDragStart}
      aria-disabled={!item.enabled}
      title={item.enabled ? `Drag ${item.name}` : `${item.name} is not available yet`}
    >
      <IconFallback name={item.name} iconUrl={item.iconUrl} />
      <span>{highlightSearch(item.name, search)}</span>
    </div>
  );
}

function AwsLogo() {
  return (
    <span className="awsLogo" aria-hidden="true">
      <span>aws</span>
      <svg viewBox="0 0 36 12" focusable="false">
        <path d="M3 7.2c8.1 4.1 18.3 4.1 29.7-1.5" />
        <path d="M30.1 3.8 34 5.4l-2.1 3.6" />
      </svg>
    </span>
  );
}

function getResourcesBySection(resources: readonly ResourceItem[]) {
  const grouped = new Map<ResourcePanelSectionId, ResourceItem[]>();

  for (const section of resourceSections) {
    grouped.set(section.id, []);
  }

  for (const item of resources) {
    if (item.id.startsWith("design-")) {
      grouped.get("design")?.push(item);
      continue;
    }

    grouped.get(item.area)?.push(item);
  }

  return grouped;
}

function IconFallback({ name, iconUrl }: { name: string; iconUrl: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/^Amazon\s+|^AWS\s+/u, "")
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (failed) {
    return <span className="resourceIconFallback">{initials || "AWS"}</span>;
  }

  return (
    <img
      className="resourceIcon"
      src={iconUrl}
      alt=""
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

function highlightSearch(name: string, search: string) {
  const needle = search.trim();
  if (!needle) {
    return name;
  }

  const index = name.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) {
    return name;
  }

  return (
    <>
      {name.slice(0, index)}
      <mark>{name.slice(index, index + needle.length)}</mark>
      {name.slice(index + needle.length)}
    </>
  );
}
