import { SelectMenu, type SelectMenuOption } from "./SelectMenu";
import styles from "./dashboard-select-field.module.css";

export type DashboardSelectOption = SelectMenuOption;

type DashboardSelectFieldProps = {
  readonly ariaLabel: string;
  readonly className?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly emptyLabel: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly DashboardSelectOption[];
  readonly value: string;
};

export function DashboardSelectField({
  ariaLabel,
  className,
  disabled,
  emptyLabel,
  label,
  onChange,
  options,
  value
}: DashboardSelectFieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      <SelectMenu
        ariaLabel={ariaLabel}
        disabled={disabled}
        emptyLabel={emptyLabel}
        onChange={onChange}
        options={options}
        size="large"
        tone="surface"
        value={value}
      />
    </div>
  );
}
