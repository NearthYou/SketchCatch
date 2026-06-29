"use client";

import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import type {
  AwsRegionCode,
  DiagramNode,
  ResourceNodeParameters
} from "../../../../packages/types/src";

import type { DiagramEditorPanelContext } from "../diagram-editor/types";
import { filterAwsRegionOptions, getAwsRegionLabel } from "./aws-region-options";
import type { ParameterCatalog, ParameterCatalogDefinition } from "./catalog";
import { terraformParameterCatalog } from "./catalog";
import {
  createRegionNodeMetadata,
  getRegionNodeAwsRegion,
  isRegionDesignNode
} from "./region-node-metadata";
import {
  buildReferenceOptions,
  getVisibleDefinitions,
  isEmptyParameterValue,
  mergeNodeParameters,
  validateParameters
} from "./validation";
import styles from "./ParameterInputPanel.module.css";

export type ParameterInputPanelProps = DiagramEditorPanelContext;

type ParameterErrors = Record<string, string>;
type RecordValue = Record<string, unknown>;

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

  if (isRegionDesignNode(selectedNode)) {
    const selectedRegion = getRegionNodeAwsRegion(selectedNode);

    return (
      <aside className={styles.panel} aria-label="파라미터 입력 패널">
        <PanelHeader node={selectedNode} parameters={null} />

        <section className={styles.section} aria-label="Main parameters">
          <div className={styles.fieldGroup}>
            <RegionField
              onChange={(awsRegion) =>
                updateNodeMetadata(selectedNode.id, {
                  metadata: createRegionNodeMetadata(selectedNode, awsRegion)
                })
              }
              value={selectedRegion}
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
        <EmptyPanel
          title="디자인 타입"
          description="Region, AZ, Group 같은 디자인 타입은 Terraform 리소스 파라미터를 가지지 않습니다."
        />
      </aside>
    );
  }

  const parameters = mergeNodeParameters(selectedNode, parameterCatalog);
  const definitions = getVisibleDefinitions(
    parameterCatalog.resources[parameters.resourceType] ?? []
  );
  const validation = validateParameters(
    parameters,
    definitions,
    nodes,
    selectedNode.id,
    parameterCatalog
  );

  const commitParameters = (nextParameters: ResourceNodeParameters) => {
    const nextValidation = validateParameters(
      nextParameters,
      definitions,
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
        <div className={styles.fieldGroup}>
          <MetadataField
            error={validation.metadataErrors.resourceName}
            label="Resource name"
            onChange={(value) => updateMetadataField("resourceName", value)}
            value={parameters.resourceName}
          />
          <MetadataField
            error={validation.metadataErrors.fileName}
            label="File name"
            onChange={(value) => updateMetadataField("fileName", value)}
            value={parameters.fileName}
          />
        </div>
      </section>

      <section className={styles.section} aria-label="Main parameters">
        {definitions.length > 0 ? (
          <div className={styles.fieldGroup}>
            {definitions.map((definition) => (
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
            이 리소스 타입은 아직 파라미터 카탈로그가 없습니다.
          </p>
        )}
      </section>
    </aside>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filteredOptions = filterAwsRegionOptions(query);

  const closeMenu = () => {
    setIsOpen(false);
    setQuery("");
  };

  const openMenu = () => {
    setIsOpen(true);
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
      closeMenu();
    }
  };

  const handleSelect = (awsRegion: AwsRegionCode) => {
    onChange(awsRegion);
    closeMenu();
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
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={`${styles.regionControl} ${isOpen ? styles.regionControlOpen : ""}`}
          onClick={() => (isOpen ? closeMenu() : openMenu())}
          type="button"
        >
          <span className={styles.regionControlText}>{getAwsRegionLabel(value)}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>

        {isOpen ? (
          <div className={styles.regionDropdown}>
            <label className={styles.regionSearch}>
              <Search aria-hidden="true" size={17} />
              <input
                aria-label="리전 검색"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search option..."
                ref={searchInputRef}
                value={query}
              />
            </label>

            {filteredOptions.length > 0 ? (
              <div
                aria-label="지원 리전"
                className={styles.regionOptionList}
                role="listbox"
              >
                {filteredOptions.map((option) => {
                  const isSelected = option.value === value;

                  return (
                    <button
                      aria-selected={isSelected}
                      className={`${styles.regionOption} ${
                        isSelected ? styles.regionOptionSelected : ""
                      }`}
                      key={option.value}
                      onClick={() => handleSelect(option.value)}
                      role="option"
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

function ParameterField({
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
  const error = errors[path];

  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>
          {definition.label}
          {definition.required ? <span className={styles.requiredMark}> *</span> : null}
        </span>
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
  return (
    <select
      className={styles.input}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
      value={typeof value === "string" ? value : ""}
    >
      <option value="">Select a value</option>
      {(definition.options ?? []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
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
    <select
      className={styles.input}
      onChange={(event) => onChange(event.currentTarget.value || undefined)}
      value={typeof value === "string" ? value : ""}
    >
      <option value="">Select a resource</option>
      {options.map((option) => (
        <option key={option.reference} value={option.reference}>
          {option.label}
        </option>
      ))}
    </select>
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

  if (definition.type === "list") {
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

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
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
