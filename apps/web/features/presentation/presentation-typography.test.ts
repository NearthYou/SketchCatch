import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sizeIncreaseToken = "var(--presentation-font-size-increase)";
const weightReductionToken = "var(--presentation-font-weight-reduction)";

function collectFiles(directory: string, extensions: readonly string[]): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(path, extensions);
    }

    return entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

const cssFiles = ["app", "components", "features"].flatMap((directory) =>
  collectFiles(join(webRoot, directory), [".css"])
);
const sourceFiles = ["app", "components", "features"].flatMap((directory) =>
  collectFiles(join(webRoot, directory), [".ts", ".tsx"]).filter(
    (path) => !path.includes(".test.")
  )
);

test("every explicit web font size adds the six-pixel presentation increase", () => {
  const globalStyles = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
  assert.match(globalStyles, /--presentation-font-size-increase:\s*6px;/);
  assert.match(
    globalStyles,
    /body\s*\{[^}]*font-size:\s*calc\(16px \+ var\(--presentation-font-size-increase\)\);/s
  );

  for (const [element, baseSize] of [
    ["h1", "32px"],
    ["h2", "24px"],
    ["h3", "18.72px"],
    ["h4", "16px"],
    ["h5", "13.28px"],
    ["h6", "10.72px"],
    ["small", "13.33px"]
  ] as const) {
    assert.match(
      globalStyles,
      new RegExp(
        `${element}\\s*\\{[^}]*font-size:\\s*calc\\(${baseSize.replace(".", "\\.")} \\+ var\\(--presentation-font-size-increase\\)\\);`,
        "s"
      )
    );
  }

  for (const cssFile of cssFiles) {
    const styles = readFileSync(cssFile, "utf8");
    const declarations = styles.matchAll(/font-size\s*:\s*([^;}]+)(?=[;}])/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      const precedingStyles = styles.slice(Math.max(0, (declaration.index ?? 0) - 200), declaration.index);

      if (value.trim() === "0") {
        assert.ok(precedingStyles.includes("ui-legibility-exception: shape"));
        continue;
      }

      assert.ok(
        value.includes(sizeIncreaseToken),
        `${cssFile}: font-size must add ${sizeIncreaseToken}: ${declaration[0]}`
      );
    }
  }
});

test("inline font sizes use the same six-pixel presentation increase", () => {
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const declarations = source.matchAll(/fontSize\s*:\s*([^,}\r\n]+)/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      assert.ok(
        value.includes("--presentation-font-size-increase"),
        `${sourceFile}: inline fontSize must use the presentation increase: ${declaration[0]}`
      );
    }
  }
});

test("explicit text weights are one Pretendard step lighter", () => {
  const globalStyles = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
  assert.match(globalStyles, /--presentation-font-weight-reduction:\s*100;/);
  assert.match(
    globalStyles,
    /h1,[\s\S]*h6,[\s\S]*strong,[\s\S]*b\s*\{[^}]*font-weight:\s*calc\(700 - var\(--presentation-font-weight-reduction\)\);/s
  );

  for (const cssFile of cssFiles) {
    const styles = readFileSync(cssFile, "utf8");
    const declarations = styles.matchAll(/font-weight\s*:\s*([^;}]+)(?=[;}])/g);

    for (const declaration of declarations) {
      const declarationIndex = declaration.index ?? 0;
      const blockStart = styles.lastIndexOf("{", declarationIndex);
      const previousBlockEnd = styles.lastIndexOf("}", blockStart);
      const blockPrelude = styles.slice(previousBlockEnd + 1, blockStart);
      const value = declaration[1] ?? "";

      if (blockPrelude.includes("@font-face") || Number.parseInt(value, 10) <= 400) {
        continue;
      }

      assert.ok(
        value.includes(weightReductionToken),
        `${cssFile}: font-weight must subtract ${weightReductionToken}: ${declaration[0]}`
      );
    }
  }

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const declarations = source.matchAll(/fontWeight\s*:\s*([^,}\r\n]+)/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      assert.ok(
        value.includes("--presentation-font-weight-reduction"),
        `${sourceFile}: inline fontWeight must use the presentation reduction: ${declaration[0]}`
      );
    }
  }
});

test("all web typography resolves to the bundled Pretendard 1.3.9 family", () => {
  const layout = readFileSync(join(webRoot, "app", "layout.tsx"), "utf8");
  const globalStyles = readFileSync(join(webRoot, "app", "globals.css"), "utf8");

  assert.match(layout, /pretendard\/dist\/web\/static\/pretendard-dynamic-subset\.css/);
  assert.match(globalStyles, /--font-sans:\s*"Pretendard",\s*sans-serif;/);
  assert.match(globalStyles, /--font-code:\s*var\(--font-sans\);/);
  assert.match(
    globalStyles,
    /code,[\s\S]*kbd,[\s\S]*pre,[\s\S]*samp\s*\{[^}]*font-family:\s*var\(--font-sans\);/s
  );

  const forbiddenFallbacks = /Inter|Geist|SFMono|Consolas|Liberation Mono|ui-monospace|monospace|Noto Sans KR/;

  for (const cssFile of cssFiles) {
    const styles = readFileSync(cssFile, "utf8");
    const declarations = styles.matchAll(/font-family\s*:\s*([^;}]+)(?=[;}])/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      assert.doesNotMatch(
        value,
        forbiddenFallbacks,
        `${cssFile}: font-family must resolve to Pretendard: ${declaration[0]}`
      );
    }
  }
});
