import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDashboardNavigationHandler,
  type DashboardNavigationClick
} from "./workspace-project-bar-navigation";

test("ordinary Dashboard navigation waits for one save and navigates in finally", async () => {
  const saveGate = createDeferred<void>();
  const navigations: string[] = [];
  let saveCount = 0;
  const handleNavigation = createDashboardNavigationHandler({
    navigate: (href) => navigations.push(href)
  });
  const firstClick = createClick();
  const duplicateClick = createClick();

  const first = handleNavigation({
    click: firstClick,
    dashboardHref: "/dashboard",
    onSave: async () => {
      saveCount += 1;
      await saveGate.promise;
      throw new Error("thumbnail failed");
    }
  });
  const duplicate = handleNavigation({
    click: duplicateClick,
    dashboardHref: "/dashboard",
    onSave: async () => {
      saveCount += 1;
    }
  });

  assert.equal(firstClick.prevented, true);
  assert.equal(duplicateClick.prevented, true);
  assert.equal(saveCount, 1);
  assert.deepEqual(navigations, []);

  saveGate.resolve();
  await Promise.all([first, duplicate]);
  assert.deepEqual(navigations, ["/dashboard"]);
});

test("modified, non-primary, prevented, and new-tab Dashboard clicks keep native anchor behavior", async () => {
  const navigations: string[] = [];
  let saveCount = 0;
  const handleNavigation = createDashboardNavigationHandler({
    navigate: (href) => navigations.push(href)
  });
  const nativeClicks = [
    createClick({ metaKey: true }),
    createClick({ ctrlKey: true }),
    createClick({ shiftKey: true }),
    createClick({ altKey: true }),
    createClick({ button: 1 }),
    createClick({ target: "_blank" }),
    createClick({ defaultPrevented: true })
  ];

  for (const click of nativeClicks) {
    await handleNavigation({
      click,
      dashboardHref: "/dashboard",
      onSave: async () => {
        saveCount += 1;
      }
    });
    assert.equal(click.prevented, false);
  }

  assert.equal(saveCount, 0);
  assert.deepEqual(navigations, []);
});

function createClick(
  overrides: Partial<Omit<DashboardNavigationClick, "preventDefault">> = {}
): DashboardNavigationClick & { prevented: boolean } {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    prevented: false,
    shiftKey: false,
    target: "",
    ...overrides,
    preventDefault() {
      this.prevented = true;
    }
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
