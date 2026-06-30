"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import styles from "./select-menu.module.css";

export type SelectMenuOption = {
  readonly detail?: string | undefined;
  readonly label: string;
  readonly value: string;
};

export type SelectMenuSize = "compact" | "regular" | "large";
export type SelectMenuTone = "default" | "dashboard" | "purple";

type SelectMenuProps = {
  readonly ariaLabel: string;
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly emptyLabel: string;
  readonly id?: string | undefined;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectMenuOption[];
  readonly size?: SelectMenuSize | undefined;
  readonly style?: CSSProperties | undefined;
  readonly tone?: SelectMenuTone | undefined;
  readonly value: string;
  readonly width?: "content" | "full" | undefined;
};

export function SelectMenu({
  ariaLabel,
  className,
  disabled = false,
  emptyLabel,
  id,
  onChange,
  options,
  size = "regular",
  style,
  tone = "default",
  value,
  width = "full"
}: SelectMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const fallbackListboxId = useId();
  const listboxId = `${id ?? fallbackListboxId}-listbox`;
  const selectedOption = options.find((option) => option.value === value);
  const activeOption = activeOptionIndex >= 0 ? options[activeOptionIndex] : undefined;
  const isDisabled = disabled || options.length === 0;
  const triggerLabel = selectedOption ? getSelectMenuTriggerLabel(selectedOption) : emptyLabel;

  const closeMenu = ({ restoreFocus = false }: { readonly restoreFocus?: boolean } = {}) => {
    setIsOpen(false);
    setActiveOptionIndex(-1);

    if (restoreFocus) {
      requestAnimationFrame(() => triggerButtonRef.current?.focus());
    }
  };

  const openMenu = () => {
    if (isDisabled) {
      return;
    }

    setIsOpen(true);
    setActiveOptionIndex(getInitialSelectMenuOptionIndex(options, value));
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && containerRef.current?.contains(nextTarget)) {
      return;
    }

    closeMenu();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;

      if (!isOpen) {
        openMenu();
        return;
      }

      setActiveOptionIndex((currentIndex) =>
        getNextSelectMenuOptionIndex(options, options[currentIndex]?.value ?? value, direction)
      );
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && isOpen && activeOption) {
      event.preventDefault();
      onChange(activeOption.value);
      closeMenu({ restoreFocus: true });
    }
  };

  const handleSelect = (option: SelectMenuOption) => {
    onChange(option.value);
    closeMenu({ restoreFocus: true });
  };

  return (
    <div
      className={[
        styles.selectMenu,
        styles[getSizeClassName(size)],
        styles[getToneClassName(tone)],
        width === "content" ? styles.contentWidth : undefined,
        className
      ]
        .filter(Boolean)
        .join(" ")}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      ref={containerRef}
      style={style}
    >
      <button
        aria-activedescendant={
          isOpen && activeOption
            ? getSelectMenuOptionDomId(listboxId, activeOption.value)
            : undefined
        }
        aria-controls={isOpen ? listboxId : undefined}
        aria-disabled={isDisabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`${styles.selectMenuTrigger} ${isOpen ? styles.selectMenuTriggerOpen : ""}`}
        disabled={isDisabled}
        id={id}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        ref={triggerButtonRef}
        type="button"
      >
        <span className={styles.selectMenuValue}>{triggerLabel}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>

      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className={styles.selectMenuDropdown}
          id={listboxId}
          role="listbox"
        >
          {options.map((option, optionIndex) => {
            const isSelected = option.value === value;
            const isActive = optionIndex === activeOptionIndex;

            return (
              <button
                aria-selected={isSelected}
                className={`${styles.selectMenuOption} ${
                  isSelected ? styles.selectMenuOptionSelected : ""
                } ${isActive ? styles.selectMenuOptionActive : ""}`}
                id={getSelectMenuOptionDomId(listboxId, option.value)}
                key={option.value}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setActiveOptionIndex(optionIndex)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span className={styles.selectMenuOptionText}>
                  <span className={styles.selectMenuOptionLabel}>{option.label}</span>
                  {option.detail ? (
                    <span className={styles.selectMenuOptionDetail}>{option.detail}</span>
                  ) : null}
                </span>
                {isSelected ? <Check aria-hidden="true" size={15} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getSelectMenuTriggerLabel(option: SelectMenuOption): string {
  return option.detail ? `${option.label} | ${option.detail}` : option.label;
}

function getInitialSelectMenuOptionIndex(
  options: readonly SelectMenuOption[],
  currentValue: string
): number {
  if (options.length === 0) {
    return -1;
  }

  const currentIndex = options.findIndex((option) => option.value === currentValue);

  return currentIndex >= 0 ? currentIndex : 0;
}

function getNextSelectMenuOptionIndex(
  options: readonly SelectMenuOption[],
  currentValue: string,
  direction: 1 | -1
): number {
  if (options.length === 0) {
    return -1;
  }

  const currentIndex = options.findIndex((option) => option.value === currentValue);

  if (currentIndex === -1) {
    return direction === 1 ? 0 : options.length - 1;
  }

  return (currentIndex + direction + options.length) % options.length;
}

function getSelectMenuOptionDomId(listboxId: string, value: string): string {
  return `${listboxId}-${value}`;
}

function getSizeClassName(size: SelectMenuSize): "compact" | "regular" | "large" {
  return size;
}

function getToneClassName(tone: SelectMenuTone): "defaultTone" | "dashboardTone" | "purpleTone" {
  if (tone === "dashboard") {
    return "dashboardTone";
  }

  if (tone === "purple") {
    return "purpleTone";
  }

  return "defaultTone";
}
