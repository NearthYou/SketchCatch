export type DashboardNavigationClick = {
  readonly altKey: boolean;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly defaultPrevented: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target: string;
  preventDefault(): void;
};

type DashboardNavigationRequest = {
  readonly click: DashboardNavigationClick;
  readonly dashboardHref: string;
  readonly onSave?: (() => Promise<unknown>) | undefined;
};

export function createDashboardNavigationHandler({
  navigate
}: {
  readonly navigate: (href: string) => void;
}) {
  let navigationPending = false;

  return async function handleDashboardNavigation({
    click,
    dashboardHref,
    onSave
  }: DashboardNavigationRequest): Promise<boolean> {
    if (
      !onSave ||
      click.defaultPrevented ||
      click.button !== 0 ||
      click.altKey ||
      click.ctrlKey ||
      click.metaKey ||
      click.shiftKey ||
      click.target.toLowerCase() === "_blank"
    ) {
      return false;
    }

    click.preventDefault();

    if (navigationPending) {
      return true;
    }

    navigationPending = true;

    try {
      await onSave();
    } catch {
      // Draft/thumbnail failure must not make Dashboard unreachable.
    } finally {
      navigate(dashboardHref);
    }

    return true;
  };
}
