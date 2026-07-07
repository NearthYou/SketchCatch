"use client";

import {
  Bot,
  Box,
  Boxes,
  Brush,
  ChartLine,
  ChevronDown,
  Component,
  Container,
  Cpu,
  Database,
  Grid2X2,
  Archive,
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
import {
  curatedModules,
  type CuratedModuleCategory,
  type CuratedModuleDefinition
} from "./module-catalog";
import {
  listBoardTemplates,
  type BoardTemplate
} from "./template-library";

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

const awsProviderVersions = ["6.47.0", "6.46.0", "6.45.0", "6.44.0"] as const;
type AwsProviderVersion = (typeof awsProviderVersions)[number];

type ResourcePanelSectionId =
  | "modules"
  | "design"
  | ResourceArea
  | "analytics"
  | "iot";

type ResourcePanelSection = {
  id: ResourcePanelSectionId;
  label: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  kind: "modules" | "resources";
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
  { id: "other", label: areaLabels.other, icon: Grid2X2, kind: "resources" }
];

export type ResourceSettingsPanelProps = {
  catalogProvider?: ResourceCatalogProvider | undefined;
  onModuleAdd?: ((moduleId: string) => void) | undefined;
  onTemplateApply?: ((template: BoardTemplate) => void) | undefined;
  onCollapse?: (() => void) | undefined;
};

export function ResourceSettingsPanel({
  catalogProvider = defaultResourceCatalogProvider,
  onModuleAdd,
  onTemplateApply,
  onCollapse
}: ResourceSettingsPanelProps = {}) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"resources" | "templates">("resources");
  const [selectedProviderVersion, setSelectedProviderVersion] = useState<AwsProviderVersion>(awsProviderVersions[0]);
  const [isProviderVersionMenuOpen, setProviderVersionMenuOpen] = useState(false);
  const [activeResourceView, setActiveResourceView] = useState<"resources" | "modules">("resources");
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
          <button
            aria-selected={activeTab === "resources"}
            className={activeTab === "resources" ? "resourceTabActive" : "resourceTab"}
            onClick={() => setActiveTab("resources")}
            role="tab"
            type="button"
          >
            Resources
          </button>
          <button
            aria-selected={activeTab === "templates"}
            className={activeTab === "templates" ? "resourceTabActive" : "resourceTab"}
            onClick={() => setActiveTab("templates")}
            role="tab"
            type="button"
          >
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
          <div
            aria-label="AWS provider"
            className="providerSelect"
            role="img"
          >
            <AwsLogo />
          </div>
          <div
            className="providerDropdown"
            onBlur={(event) => {
              const nextFocusedElement = event.relatedTarget as Node | null;

              if (!event.currentTarget.contains(nextFocusedElement)) {
                setProviderVersionMenuOpen(false);
              }
            }}
          >
            <button
              aria-expanded={isProviderVersionMenuOpen}
              aria-haspopup="listbox"
              aria-label="Terraform AWS provider version"
              className="providerSelect providerVersionSelect providerVersionTrigger"
              onClick={() => setProviderVersionMenuOpen((isOpen) => !isOpen)}
              type="button"
            >
              <span className="providerVersionValue">{selectedProviderVersion}</span>
              <ChevronDown
                aria-hidden="true"
                className={isProviderVersionMenuOpen ? "providerVersionChevron providerVersionChevronOpen" : "providerVersionChevron"}
                size={16}
              />
            </button>
            {isProviderVersionMenuOpen ? (
              <div className="providerVersionMenu" role="listbox" aria-label="AWS provider versions">
                {awsProviderVersions.map((version) => (
                  <button
                    aria-selected={selectedProviderVersion === version}
                    className={selectedProviderVersion === version ? "providerVersionOptionActive" : "providerVersionOption"}
                    key={version}
                    onClick={() => {
                      setSelectedProviderVersion(version);
                      setProviderVersionMenuOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    {version}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="resourceViewToggles" aria-label="Resource view mode">
          <button
            aria-pressed={activeResourceView === "resources"}
            className={activeResourceView === "resources" ? "resourceViewToggleActive" : "resourceViewToggle"}
            onClick={() => setActiveResourceView("resources")}
            type="button"
            title="Resources"
          >
            <Box aria-hidden="true" size={20} />
          </button>
          <button
            aria-pressed={activeResourceView === "modules"}
            className={activeResourceView === "modules" ? "resourceViewToggleActive" : "resourceViewToggle"}
            onClick={() => setActiveResourceView("modules")}
            type="button"
            title="Modules"
          >
            <Boxes aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      {activeTab === "templates" ? (
        <TemplatesPanel onTemplateApply={onTemplateApply} />
      ) : activeResourceView === "modules" ? (
        <ModuleCatalogPanel onModuleAdd={onModuleAdd} />
      ) : (
        <>

          <label className="searchBox">
            <Search size={18} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search TF resources"
              aria-label="Search resources by name"
            />
          </label>

          <div className="resourcePanelSeparator" role="separator" />

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
            <div className="resourceAreas resourceCatalogScroll">
              {resourceSections.map((section) => (
                <ResourceSection
                  isOpen={Boolean(openSections[section.id])}
                  items={resourcesBySection.get(section.id) ?? []}
                  key={section.id}
                  onOpenModuleCatalog={() => setActiveResourceView("modules")}
                  onToggle={() => toggleSection(section.id)}
                  section={section}
                />
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function TemplatesPanel({
  onTemplateApply
}: {
  readonly onTemplateApply?: ((template: BoardTemplate) => void) | undefined;
}) {
  const [isModalOpen, setModalOpen] = useState(false);
  const templates = listBoardTemplates();

  return (
    <>
      <div className="templateCatalogPanel">
        <button className="templateCatalogCard templateCatalogCardWide" onClick={() => setModalOpen(true)} type="button">
          <span>Template library</span>
          <strong>큰 모달로 열기</strong>
        </button>
        {templates.slice(0, 3).map((template) => (
          <button className="templateCatalogCard" key={template.id} onClick={() => setModalOpen(true)} type="button">
            <span>{template.tags.slice(0, 2).join(" · ")}</span>
            <strong>{template.title}</strong>
          </button>
        ))}
      </div>

      {isModalOpen ? (
        <TemplateLibraryModal
          onClose={() => setModalOpen(false)}
          onTemplateApply={(template) => {
            onTemplateApply?.(template);
            setModalOpen(false);
          }}
          templates={templates}
        />
      ) : null}
    </>
  );
}

function TemplateLibraryModal({
  onClose,
  onTemplateApply,
  templates
}: {
  readonly onClose: () => void;
  readonly onTemplateApply: (template: BoardTemplate) => void;
  readonly templates: readonly BoardTemplate[];
}) {
  return (
    <div className="templateModalOverlay" role="presentation">
      <section className="templateModal" aria-label="Template 큰 모달" role="dialog">
        <div className="templateModalHeader">
          <div>
            <span>Template library</span>
            <h2>템플릿 보관함</h2>
            <p>선택하면 현재 보드를 백업하고 템플릿 구조로 덮어씁니다.</p>
          </div>
          <button className="templateModalCloseButton" onClick={onClose} type="button">
            닫기
          </button>
        </div>

        <div className="templateModalGrid">
          {templates.map((template) => (
            <article className="templateModalCard" key={template.id}>
              <div>
                <span>{template.tags.join(" · ")}</span>
                <h3>{template.title}</h3>
                <p>{template.description}</p>
              </div>
              <div className="templateModalPreview" aria-hidden="true">
                {template.diagramJson.nodes.slice(0, 5).map((node) => (
                  <i key={node.id} style={{ left: `${Math.min(78, node.position.x / 10)}%`, top: `${Math.min(76, node.position.y / 8)}%` }} />
                ))}
              </div>
              <button className="templateModalApplyButton" onClick={() => onTemplateApply(template)} type="button">
                이 템플릿 적용
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleCatalogPanel({ onModuleAdd }: { readonly onModuleAdd?: ((moduleId: string) => void) | undefined }) {
  return (
    <div className="moduleCatalogPanel">
      {moduleCategories.map((category) => {
        const modules = curatedModules.filter((moduleDefinition) => moduleDefinition.category === category.id);
        const CategoryIcon = category.icon;

        return (
          <section className="moduleCatalogSection" key={category.id}>
            <div className="moduleCatalogHeader">
              <CategoryIcon size={18} aria-hidden="true" />
              <span>{category.label}</span>
            </div>
            <div className="moduleCatalogGrid">
              {modules.map((moduleDefinition) => (
                <ModuleCatalogCard
                  key={moduleDefinition.id}
                  moduleDefinition={moduleDefinition}
                  onModuleAdd={onModuleAdd}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ModuleCatalogCard({
  moduleDefinition,
  onModuleAdd
}: {
  readonly moduleDefinition: CuratedModuleDefinition;
  readonly onModuleAdd?: ((moduleId: string) => void) | undefined;
}) {
  return (
    <button
      className="moduleCatalogCard"
      onClick={() => onModuleAdd?.(moduleDefinition.id)}
      type="button"
    >
      <span>{moduleDefinition.name}</span>
      <strong>{moduleDefinition.resources.length} resources</strong>
    </button>
  );
}

const moduleCategories: readonly {
  readonly id: CuratedModuleCategory;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "compute", label: "Compute", icon: Cpu },
  { id: "network", label: "Network", icon: Network },
  { id: "storage", label: "Storage", icon: Archive },
  { id: "database", label: "Database", icon: Database },
  { id: "security-identity", label: "Security & Identity", icon: ShieldCheck }
];

function ResourceSection({
  isOpen,
  items,
  onOpenModuleCatalog,
  onToggle,
  section
}: {
  isOpen: boolean;
  items: readonly ResourceItem[];
  onOpenModuleCatalog: () => void;
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
        <ChevronDown
          aria-hidden="true"
          className={isOpen ? "resourceAreaChevron resourceAreaChevronOpen" : "resourceAreaChevron"}
          size={18}
        />
      </button>

      {isOpen && section.kind === "modules" ? (
        <div className="resourceSectionBody">
          <div className="resourceModulesEmptyState">
            <strong>No modules yet</strong>
            <span className="resourceModulesDescription">
              Import or browse curated modules when you want grouped Terraform resources.
            </span>
            <div className="resourceModulesActions">
              <button className="modulesImportButton" onClick={onOpenModuleCatalog} type="button">
                Import
              </button>
              <button className="modulesCatalogButton" onClick={onOpenModuleCatalog} type="button">
                Catalog
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
    </section>
  );
}

function ResourceTile({ item, search }: { item: ResourceItem; search: string }) {
  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!item.enabled) {
      event.preventDefault();
      return;
    }

    writeResourceDragPayload(event.dataTransfer, item);
  };

  return (
    <button
      className={`resourceTile ${item.enabled ? "" : "resourceTileDisabled"}`}
      draggable={item.enabled}
      disabled={!item.enabled}
      onDragEnd={clearActiveResourceDragPayload}
      onDragStart={onDragStart}
      aria-disabled={!item.enabled}
      title={item.enabled ? `Drag ${item.name}` : `${item.name} is not available yet`}
      type="button"
    >
      <IconFallback name={item.name} iconUrl={item.iconUrl} />
      <span className="resourceTileLabel">{highlightSearch(item.name, search)}</span>
    </button>
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
