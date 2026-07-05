"use client";

import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import type {
  AwsRegionCode,
  DiagramNode,
  ResourceNodeParameters
} from "../../../../packages/types/src";

import { SelectMenu } from "../../components/ui/SelectMenu";
import type { DiagramEditorPanelContext } from "../diagram-editor/types";
import {
  getAwsAvailabilityZoneLabel,
  awsAvailabilityZoneOptions
} from "./aws-availability-zone-options";
import {
  filterAwsRegionOptions,
  getAwsRegionLabel,
  getNextAwsRegionOptionIndex
} from "./aws-region-options";
import type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog";
import { terraformParameterCatalog } from "./catalog";
import {
  getAvailabilityZoneNodeValue,
  getRegionNodeAwsRegion,
  isAvailabilityZoneResourceNode,
  isRegionResourceNode,
  updateAvailabilityZoneNodeParameters,
  updateRegionNodeParameters
} from "./region-node-metadata";
import { buildResourceMetadataRows } from "./resource-metadata-rows";
import {
  buildReferenceOptions,
  getRequiredDefinitions,
  getValidationDefinitions,
  isEmptyParameterValue,
  mergeNodeParameters,
  validateParameters
} from "./validation";
import styles from "./ParameterInputPanel.module.css";

export type ParameterInputPanelProps = DiagramEditorPanelContext;

type ParameterErrors = Record<string, string>;
type RecordValue = Record<string, unknown>;
type CloseMenuOptions = {
  restoreFocus?: boolean;
};

const parameterCatalog: ParameterCatalog = terraformParameterCatalog;

export function ParameterInputPanel({
  nodes,
  selectedNodeId,
  updateNodeMetadata,
  updateNodeParameters
}: ParameterInputPanelProps) {
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  if (!selectedNode) {
    return (
      <aside className={styles.panel} aria-label="파라미터 입력 패널">
        <EmptyPanel
          title="선택된 리소스 없음"
          description="캔버스에서 AWS 리소스 노드를 선택하면 Terraform metadata와 main parameters를 입력할 수 있습니다."
        />
      </aside>
    );
  }

  if (isRegionResourceNode(selectedNode) && selectedNode.parameters) {
    const selectedRegion = getRegionNodeAwsRegion(selectedNode);

    return (
      <aside className={styles.panel} aria-label="파라미터 입력 패널">
        <PanelHeader node={selectedNode} parameters={null} />

        <DesignAreaNameSection
          node={selectedNode}
          onChange={(label) => updateNodeMetadata(selectedNode.id, { label })}
        />

        <section className={styles.section} aria-label="Main parameters">
          <div className={styles.sectionHeader}>
            <h3>Region</h3>
          </div>
          <div className={styles.fieldGroup}>
            <RegionField
              onChange={(awsRegion) =>
                updateNodeParameters(selectedNode.id, (parameters) =>
                  parameters ? updateRegionNodeParameters(parameters, awsRegion) : parameters
                )
              }
              value={selectedRegion}
            />
          </div>
        </section>
      </aside>
    );
  }

  if (isAvailabilityZoneResourceNode(selectedNode) && selectedNode.parameters) {
    const selectedAvailabilityZone = getAvailabilityZoneNodeValue(selectedNode);

    return (
      <aside className={styles.panel} aria-label="파라미터 입력 패널">
        <PanelHeader node={selectedNode} parameters={null} />

        <DesignAreaNameSection
          node={selectedNode}
          onChange={(label) => updateNodeMetadata(selectedNode.id, { label })}
        />

        <section className={styles.section} aria-label="Main parameters">
          <div className={styles.sectionHeader}>
            <h3>Availability Zone</h3>
          </div>
          <div className={styles.fieldGroup}>
            <AvailabilityZoneField
              onChange={(awsAvailabilityZone) =>
                updateNodeParameters(selectedNode.id, (parameters) =>
                  parameters
                    ? updateAvailabilityZoneNodeParameters(parameters, awsAvailabilityZone)
                    : parameters
                )
              }
              value={selectedAvailabilityZone}
            />
          </div>
        </section>
      </aside>
    );
  }

  if (selectedNode.kind !== "resource") {
    return (
      <aside className={styles.panel} aria-label="파라미터 입력 패널">
        <PanelHeader node={selectedNode} parameters={null} />
        <DesignAreaNameSection
          node={selectedNode}
          onChange={(label) => updateNodeMetadata(selectedNode.id, { label })}
        />
        <EmptyPanel
          title="디자인 타입"
          description="Region, AZ, Group 같은 디자인 타입은 Terraform 리소스 파라미터를 가지지 않습니다."
        />
      </aside>
    );
  }

  const parameters = mergeNodeParameters(selectedNode, parameterCatalog);
  const catalogDefinitions = parameterCatalog.resources[parameters.resourceType] ?? [];
  const mainDefinitions = getRequiredDefinitions(catalogDefinitions);
  const validationDefinitions = getValidationDefinitions(catalogDefinitions, parameters.values);
  const metadataRows = buildResourceMetadataRows(parameters);
  const validation = validateParameters(
    parameters,
    validationDefinitions,
    nodes,
    selectedNode.id,
    parameterCatalog
  );

  const commitParameters = (nextParameters: ResourceNodeParameters) => {
    const nextValidationDefinitions = getValidationDefinitions(catalogDefinitions, nextParameters.values);
    const nextValidation = validateParameters(
      nextParameters,
      nextValidationDefinitions,
      nodes,
      selectedNode.id,
      parameterCatalog
    );

    updateNodeParameters(selectedNode.id, {
      ...nextParameters,
      invalid: nextValidation.invalid
    });
  };

  const updateMetadataField = (
    field: "resourceName" | "fileName",
    value: string
  ) => {
    const nextParameters = {
      ...parameters,
      [field]: value
    };

    commitParameters(nextParameters);

    if (field === "resourceName" && value.trim().length > 0) {
      updateNodeMetadata(selectedNode.id, {
        label: value
      });
    }
  };

  const updateParameterValue = (definition: ParameterCatalogDefinition, value: unknown) => {
    const nextValues = setRecordValue(parameters.values, definition.name, value);

    commitParameters({
      ...parameters,
      values: nextValues
    });
  };

  return (
    <aside className={styles.panel} aria-label="파라미터 입력 패널">
      <PanelHeader node={selectedNode} parameters={parameters} />

      <section className={styles.section} aria-label="Metadata">
        <div className={styles.sectionHeader}>
          <h3>Metadata</h3>
        </div>
        <div className={styles.fieldGroup}>
          {metadataRows.map((row) =>
            row.editable ? (
              <MetadataField
                error={validation.metadataErrors[row.key]}
                key={row.key}
                label={row.label}
                onChange={(value) => updateMetadataField(row.key, value)}
                value={row.value}
              />
            ) : (
              <ReadonlyMetadataField key={row.key} label={row.label} value={row.value} />
            )
          )}
        </div>
      </section>

      <section className={styles.section} aria-label="Main parameters">
        <div className={styles.sectionHeader}>
          <h3>Main parameters</h3>
        </div>
        {mainDefinitions.length > 0 ? (
          <div className={styles.fieldGroup}>
            {mainDefinitions.map((definition) => (
              <ParameterField
                catalog={parameterCatalog}
                currentNodeId={selectedNode.id}
                definition={definition}
                errors={validation.parameterErrors}
                key={definition.name}
                nodes={nodes}
                onChange={(value) => updateParameterValue(definition, value)}
                path={definition.name}
                value={parameters.values[definition.name]}
              />
            ))}
          </div>
        ) : (
          <p className={styles.inlineEmpty}>
            {catalogDefinitions.length > 0
              ? "필수 파라미터가 없습니다."
              : "이 리소스 타입은 아직 파라미터 카탈로그가 없습니다."}
          </p>
        )}
      </section>

    </aside>
  );
}

function DesignAreaNameSection({
  node,
  onChange
}: {
  node: DiagramNode;
  onChange: (label: string) => void;
}) {
  return (
    <section className={styles.section} aria-label="Area metadata">
      <div className={styles.sectionHeader}>
        <h3>Metadata</h3>
      </div>
      <div className={styles.fieldGroup}>
        <MetadataField label="Name" onChange={onChange} value={node.label} />
      </div>
    </section>
  );
}

function RegionField({
  onChange,
  value
}: {
  onChange: (value: AwsRegionCode) => void;
  value: AwsRegionCode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const filteredOptions = useMemo(() => filterAwsRegionOptions(query), [query]);
  const activeOption = activeOptionIndex >= 0 ? filteredOptions[activeOptionIndex] : undefined;
  const selectedRegionLabel = getAwsRegionLabel(value);

  const closeMenu = ({ restoreFocus = false }: CloseMenuOptions = {}) => {
    setIsOpen(false);
    setQuery("");
    setActiveOptionIndex(-1);

    if (restoreFocus) {
      requestAnimationFrame(() => {
        triggerButtonRef.current?.focus();
      });
    }
  };

  const openMenu = () => {
    setIsOpen(true);
    setActiveOptionIndex(getInitialRegionOptionIndex(filteredOptions, value));
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && containerRef.current?.contains(nextTarget)) {
      return;
    }

    closeMenu();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    }
  };

  const handleControlKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    setIsOpen(true);
    setActiveOptionIndex(
      getNextAwsRegionOptionIndex(
        filteredOptions,
        getInitialRegionOptionIndex(filteredOptions, value),
        event.key === "ArrowDown" ? 1 : -1
      )
    );
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveOptionIndex((currentIndex) =>
        getNextAwsRegionOptionIndex(
          filteredOptions,
          currentIndex,
          event.key === "ArrowDown" ? 1 : -1
        )
      );
      return;
    }

    if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      handleSelect(activeOption.value);
    }
  };

  const handleSelect = (awsRegion: AwsRegionCode) => {
    onChange(awsRegion);
    closeMenu({ restoreFocus: true });
  };

  const handleSearchQueryChange = (queryValue: string) => {
    const nextOptions = filterAwsRegionOptions(queryValue);

    setQuery(queryValue);
    setActiveOptionIndex(getInitialRegionOptionIndex(nextOptions, value));
  };

  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>Region</span>
      </div>

      <div
        className={styles.regionCombobox}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        ref={containerRef}
      >
        <button
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`리전 선택: ${selectedRegionLabel}`}
          className={`${styles.regionControl} ${isOpen ? styles.regionControlOpen : ""}`}
          onClick={() => (isOpen ? closeMenu() : openMenu())}
          onKeyDown={handleControlKeyDown}
          ref={triggerButtonRef}
          type="button"
        >
          <span className={styles.regionControlText}>{selectedRegionLabel}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>

        {isOpen ? (
          <div className={styles.regionDropdown}>
            <label className={styles.regionSearch}>
              <Search aria-hidden="true" size={17} />
              <input
                aria-activedescendant={
                  activeOption ? getRegionOptionDomId(listboxId, activeOption.value) : undefined
                }
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-label="리전 검색"
                autoComplete="off"
                onChange={(event) => handleSearchQueryChange(event.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search option..."
                ref={searchInputRef}
                value={query}
              />
            </label>

            {filteredOptions.length > 0 ? (
              <div
                aria-label="지원 리전"
                className={styles.regionOptionList}
                id={listboxId}
                role="listbox"
              >
                {filteredOptions.map((option, optionIndex) => {
                  const isSelected = option.value === value;
                  const isActive = optionIndex === activeOptionIndex;

                  return (
                    <button
                      aria-selected={isSelected}
                      className={`${styles.regionOption} ${
                        isSelected ? styles.regionOptionSelected : ""
                      } ${isActive ? styles.regionOptionActive : ""}`}
                      id={getRegionOptionDomId(listboxId, option.value)}
                      key={option.value}
                      onMouseEnter={() => setActiveOptionIndex(optionIndex)}
                      onClick={() => handleSelect(option.value)}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      <span className={styles.regionOptionText}>
                        <span className={styles.regionOptionLabel}>{option.label}</span>
                        <span className={styles.regionOptionCode}>{option.value}</span>
                      </span>
                      {isSelected ? <Check aria-hidden="true" size={15} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={styles.regionEmpty}>검색 결과가 없습니다.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AvailabilityZoneField({
  onChange,
  value
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>Availability Zone</span>
      </div>
      <SelectMenu
        ariaLabel={`가용 영역 선택: ${getAwsAvailabilityZoneLabel(value)}`}
        emptyLabel="Availability Zone"
        onChange={onChange}
        options={awsAvailabilityZoneOptions}
        value={value}
      />
    </div>
  );
}

function getInitialRegionOptionIndex(
  options: readonly { value: AwsRegionCode }[],
  value: AwsRegionCode
): number {
  if (options.length === 0) {
    return -1;
  }

  const selectedIndex = options.findIndex((option) => option.value === value);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

function getRegionOptionDomId(listboxId: string, value: AwsRegionCode): string {
  return `${listboxId}-${value}`;
}

function PanelHeader({
  node,
  parameters
}: {
  node: DiagramNode;
  parameters: ResourceNodeParameters | null;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const resourceType = parameters?.resourceType ?? node.type;

  return (
    <header className={styles.header}>
      {node.iconUrl && !iconFailed ? (
        <img
          alt=""
          className={styles.resourceIcon}
          draggable={false}
          onError={() => setIconFailed(true)}
          src={node.iconUrl}
        />
      ) : (
        <div className={styles.resourceIcon} aria-hidden="true">
          {getInitials(resourceType)}
        </div>
      )}
      <div className={styles.headerText}>
        <h2>{node.label}</h2>
      </div>
    </header>
  );
}

function EmptyPanel({ description, title }: { description: string; title: string }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon} aria-hidden="true">
        AWS
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function MetadataField({
  error,
  label,
  onChange,
  value
}: {
  error?: string | undefined;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{label}</span>
      </span>
      <input
        className={`${styles.input} ${error ? styles.inputInvalid : ""}`}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
      {error ? <p className={styles.errorText}>{error}</p> : null}
    </label>
  );
}

function ReadonlyMetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{label}</span>
      </span>
      <span className={styles.readonlyValue}>{value}</span>
    </div>
  );
}

function ParameterField({
  catalog,
  currentNodeId,
  definition,
  errors,
  nodes,
  onChange,
  onRemove,
  path,
  value
}: {
  catalog: ParameterCatalog;
  currentNodeId: string;
  definition: ParameterCatalogDefinition;
  errors: ParameterErrors;
  nodes: readonly DiagramNode[];
  onChange: (value: unknown) => void;
  onRemove?: (() => void) | undefined;
  path: string;
  value: unknown;
}) {
  const error = errors[path];

  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>
          {definition.label}
          {definition.required ? <span className={styles.requiredMark}> *</span> : null}
        </span>
        {onRemove ? (
          <IconButton
            className={styles.fieldActionButton}
            label={`${definition.label} 삭제`}
            onClick={onRemove}
          />
        ) : null}
      </div>

      <ParameterControl
        catalog={catalog}
        currentNodeId={currentNodeId}
        definition={definition}
        errors={errors}
        nodes={nodes}
        onChange={onChange}
        path={path}
        value={value}
      />

      {error ? <p className={styles.errorText}>{error}</p> : null}
    </div>
  );
}

function ParameterControl({
  catalog,
  currentNodeId,
  definition,
  errors,
  nodes,
  onChange,
  path,
  value
}: {
  catalog: ParameterCatalog;
  currentNodeId: string;
  definition: ParameterCatalogDefinition;
  errors: ParameterErrors;
  nodes: readonly DiagramNode[];
  onChange: (value: unknown) => void;
  path: string;
  value: unknown;
}) {
  if (definition.inputKind === "reference-picker") {
    return (
      <ReferencePicker
        catalog={catalog}
        currentNodeId={currentNodeId}
        definition={definition}
        nodes={nodes}
        onChange={onChange}
        value={value}
      />
    );
  }

  if (definition.inputKind === "select") {
    return <SelectControl definition={definition} onChange={onChange} value={value} />;
  }

  if (definition.inputKind === "multi-select") {
    return <MultiSelectControl definition={definition} onChange={onChange} value={value} />;
  }

  if (definition.inputKind === "checkbox") {
    return (
      <label className={styles.checkboxRow}>
        <input
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Enabled</span>
      </label>
    );
  }

  if (definition.inputKind === "key-value" || definition.type === "map") {
    return <MapEditor onChange={onChange} value={value} />;
  }

  if (definition.inputKind === "nested-block") {
    return (
      <NestedEditor
        catalog={catalog}
        currentNodeId={currentNodeId}
        definition={definition}
        errors={errors}
        nodes={nodes}
        onChange={onChange}
        path={path}
        value={value}
      />
    );
  }

  if (definition.type === "list" || definition.type === "set") {
    return <ListEditor onChange={onChange} placeholder={definition.placeholder} value={value} />;
  }

  if (definition.inputKind === "number" || definition.type === "number") {
    return (
      <input
        className={styles.input}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onChange(nextValue.length === 0 ? undefined : Number(nextValue));
        }}
        placeholder={definition.placeholder}
        type="number"
        value={typeof value === "number" ? String(value) : ""}
      />
    );
  }

  return (
    <input
      className={styles.input}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={definition.placeholder}
      value={valueToString(value)}
    />
  );
}

function SelectControl({
  definition,
  onChange,
  value
}: {
  definition: ParameterCatalogDefinition;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const selectedValue = typeof value === "string" ? value : "";

  return (
    <SelectMenu
      ariaLabel={`${definition.label ?? definition.name} 선택`}
      emptyLabel="Select a value"
      onChange={(nextValue) => onChange(nextValue || undefined)}
      options={(definition.options ?? []).map((option) => ({
        label: option,
        value: option
      }))}
      tone="purple"
      value={selectedValue}
    />
  );
}

function MultiSelectControl({
  definition,
  onChange,
  value
}: {
  definition: ParameterCatalogDefinition;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const selectedValues = toStringArray(value);

  return (
    <div className={styles.optionGrid}>
      {(definition.options ?? []).map((option) => {
        const checked = selectedValues.includes(option);

        return (
          <label className={styles.optionPill} key={option}>
            <input
              checked={checked}
              onChange={() =>
                onChange(toggleStringValue(selectedValues, option, !checked))
              }
              type="checkbox"
            />
            <span>{option}</span>
          </label>
        );
      })}
    </div>
  );
}

function ReferencePicker({
  catalog,
  currentNodeId,
  definition,
  nodes,
  onChange,
  value
}: {
  catalog: ParameterCatalog;
  currentNodeId: string;
  definition: ParameterCatalogDefinition;
  nodes: readonly DiagramNode[];
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const options = buildReferenceOptions(nodes, currentNodeId, definition, catalog);
  const isListReference = definition.type === "list" || definition.type === "set";
  const selectedValues = toStringArray(value);

  if (options.length === 0) {
    return (
      <div className={styles.referencePicker}>
        <p className={styles.inlineEmpty}>연결 가능한 대상 리소스가 아직 없습니다.</p>
      </div>
    );
  }

  if (isListReference) {
    return (
      <div className={styles.optionGrid}>
        {options.map((option) => {
          const checked = selectedValues.includes(option.reference);

          return (
            <label className={styles.optionPill} key={option.reference}>
              <input
                checked={checked}
                onChange={() =>
                  onChange(toggleStringValue(selectedValues, option.reference, !checked))
                }
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <SelectMenu
      ariaLabel={`${definition.label ?? definition.name} 리소스 선택`}
      emptyLabel="Select a resource"
      onChange={(nextValue) => onChange(nextValue || undefined)}
      options={options.map((option) => ({
        label: option.label,
        value: option.reference
      }))}
      tone="purple"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function ListEditor({
  onChange,
  placeholder,
  value
}: {
  onChange: (value: unknown) => void;
  placeholder?: string | undefined;
  value: unknown;
}) {
  const values = Array.isArray(value) ? value.map(valueToString) : [];

  return (
    <div className={styles.listEditor}>
      {values.length === 0 ? <p className={styles.inlineEmpty}>목록 값이 없습니다.</p> : null}
      {values.map((entry, index) => (
        <div className={styles.arrayRow} key={`${entry}-${index}`}>
          <input
            className={styles.input}
            onChange={(event) =>
              onChange(values.map((item, itemIndex) => (itemIndex === index ? event.currentTarget.value : item)))
            }
            placeholder={placeholder}
            value={entry}
          />
          <IconButton
            label="항목 삭제"
            onClick={() => onChange(values.filter((_item, itemIndex) => itemIndex !== index))}
          />
        </div>
      ))}
      <button className={styles.addButton} onClick={() => onChange([...values, ""])} type="button">
        <Plus aria-hidden="true" size={14} />
        항목 추가
      </button>
    </div>
  );
}

function MapEditor({ onChange, value }: { onChange: (value: unknown) => void; value: unknown }) {
  const record = toRecord(value);
  const entries = Object.entries(record);

  return (
    <div className={styles.mapEditor}>
      {entries.length === 0 ? <p className={styles.inlineEmpty}>key-value 값이 없습니다.</p> : null}
      {entries.map(([entryKey, entryValue], index) => (
        <div className={styles.mapRow} key={`${entryKey}-${index}`}>
          <input
            className={styles.input}
            onChange={(event) => {
              const nextRecord = { ...record };
              delete nextRecord[entryKey];
              nextRecord[event.currentTarget.value] = valueToString(entryValue);
              onChange(nextRecord);
            }}
            placeholder="key"
            value={entryKey}
          />
          <input
            className={styles.input}
            onChange={(event) =>
              onChange({
                ...record,
                [entryKey]: event.currentTarget.value
              })
            }
            placeholder="value"
            value={valueToString(entryValue)}
          />
          <IconButton
            label="항목 삭제"
            onClick={() => {
              const nextRecord = { ...record };
              delete nextRecord[entryKey];
              onChange(nextRecord);
            }}
          />
        </div>
      ))}
      <button
        className={styles.addButton}
        onClick={() => {
          const nextKey = `key${entries.length + 1}`;
          onChange({
            ...record,
            [nextKey]: ""
          });
        }}
        type="button"
      >
        <Plus aria-hidden="true" size={14} />
        항목 추가
      </button>
    </div>
  );
}

function NestedEditor({
  catalog,
  currentNodeId,
  definition,
  errors,
  nodes,
  onChange,
  path,
  value
}: {
  catalog: ParameterCatalog;
  currentNodeId: string;
  definition: ParameterCatalogDefinition;
  errors: ParameterErrors;
  nodes: readonly DiagramNode[];
  onChange: (value: unknown) => void;
  path: string;
  value: unknown;
}) {
  const children = definition.children ?? [];

  if (definition.type === "list" || definition.type === "set") {
    const blocks = Array.isArray(value) ? value.map(toRecord) : [];

    return (
      <div className={styles.nestedEditor}>
        {blocks.length === 0 ? <p className={styles.inlineEmpty}>nested block이 없습니다.</p> : null}
        {blocks.map((block, blockIndex) => (
          <details className={styles.nestedBlock} key={blockIndex} open>
            <summary>{`${definition.label} ${blockIndex + 1}`}</summary>
            <div className={styles.nestedFields}>
              {children.map((child) => (
                <ParameterField
                  catalog={catalog}
                  currentNodeId={currentNodeId}
                  definition={child}
                  errors={errors}
                  key={child.name}
                  nodes={nodes}
                  onChange={(childValue) => {
                    const nextBlock = setRecordValue(block, child.name, childValue);
                    onChange(blocks.map((item, index) => (index === blockIndex ? nextBlock : item)));
                  }}
                  path={`${path}.${blockIndex}.${child.name}`}
                  value={block[child.name]}
                />
              ))}
              <button
                className={styles.removeBlockButton}
                onClick={() => onChange(blocks.filter((_block, index) => index !== blockIndex))}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
                블록 삭제
              </button>
            </div>
          </details>
        ))}
        <button className={styles.addButton} onClick={() => onChange([...blocks, {}])} type="button">
          <Plus aria-hidden="true" size={14} />
          블록 추가
        </button>
      </div>
    );
  }

  const block = toRecord(value);

  return (
    <div className={styles.nestedEditor}>
      <details className={styles.nestedBlock} open>
        <summary>{definition.label}</summary>
        <div className={styles.nestedFields}>
          {children.map((child) => (
            <ParameterField
              catalog={catalog}
              currentNodeId={currentNodeId}
              definition={child}
              errors={errors}
              key={child.name}
              nodes={nodes}
              onChange={(childValue) => onChange(setRecordValue(block, child.name, childValue))}
              path={`${path}.${child.name}`}
              value={block[child.name]}
            />
          ))}
        </div>
      </details>
    </div>
  );
}

function IconButton({
  className,
  label,
  onClick
}: {
  className?: string | undefined;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`${styles.iconButton} ${styles.iconButtonDanger} ${className ?? ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Trash2 aria-hidden="true" size={14} />
    </button>
  );
}

function setRecordValue(record: RecordValue, key: string, value: unknown): RecordValue {
  const nextRecord = { ...record };

  if (value === undefined || isEmptyParameterValue(value)) {
    delete nextRecord[key];
    return nextRecord;
  }

  nextRecord[key] = value;
  return nextRecord;
}

function toggleStringValue(values: readonly string[], value: string, checked: boolean): string[] {
  if (checked) {
    return values.includes(value) ? [...values] : [...values, value];
  }

  return values.filter((item) => item !== value);
}

function valueToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toRecord(value: unknown): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as RecordValue;
}

function getInitials(value: string): string {
  const initials = value
    .replace(/^aws_/u, "")
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "AWS";
}
