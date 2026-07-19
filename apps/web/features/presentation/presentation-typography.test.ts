import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sizeIncreaseToken = "var(--presentation-font-size-increase)";
const regularWeightToken = "var(--presentation-font-weight-regular)";
const boldWeightToken = "var(--presentation-font-weight-bold)";
const legacyCodeFontStack = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

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

test("explicit text weights use the regular and bold LINE Seed presentation scale", () => {
  const globalStyles = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
  assert.match(globalStyles, /--presentation-font-weight-regular:\s*400;/);
  assert.match(globalStyles, /--presentation-font-weight-bold:\s*700;/);
  assert.match(
    globalStyles,
    /body\s*\{[^}]*font-weight:\s*var\(--presentation-font-weight-regular\);/s
  );
  assert.match(
    globalStyles,
    /h1,[\s\S]*h6,[\s\S]*strong,[\s\S]*b\s*\{[^}]*font-weight:\s*var\(--presentation-font-weight-bold\);/s
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

      if (blockPrelude.includes("@font-face")) {
        continue;
      }

      assert.ok(
        value.includes(regularWeightToken) || value.includes(boldWeightToken),
        `${cssFile}: font-weight must use the regular or bold LINE Seed token: ${declaration[0]}`
      );
    }
  }

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const declarations = source.matchAll(/fontWeight\s*:\s*([^,}\r\n]+)/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      assert.ok(
        value.includes("--presentation-font-weight-regular") ||
          value.includes("--presentation-font-weight-bold"),
        `${sourceFile}: inline fontWeight must use the regular or bold LINE Seed token: ${declaration[0]}`
      );
    }
  }
});

test("web typography uses LINE Seed except for Terraform code and Deployment logs", () => {
  const layout = readFileSync(join(webRoot, "app", "layout.tsx"), "utf8");
  const globalStyles = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
  const packageJson = readFileSync(join(webRoot, "package.json"), "utf8");
  const localFontFiles = new Map([
    ["LINESeedKR-Th.woff2", 385_412],
    ["LINESeedKR-Rg.woff2", 523_808],
    ["LINESeedKR-Bd.woff2", 463_480]
  ]);
  const localFontDirectory = join(webRoot, "public", "fonts", "line-seed");
  const landingStyles = readFileSync(
    join(webRoot, "features", "landing", "product-entry.module.css"),
    "utf8"
  );
  const diagramStyles = readFileSync(
    join(webRoot, "features", "diagram-editor", "diagram-editor.module.css"),
    "utf8"
  );
  const aiWorkbenchStyles = readFileSync(
    join(webRoot, "features", "workspace", "workspace-ai-workbench.module.css"),
    "utf8"
  );
  const terraformEditorStyles = readFileSync(
    join(webRoot, "features", "workspace", "TerraformCodeEditorSurface.module.css"),
    "utf8"
  );
  const workspaceStyles = readFileSync(
    join(webRoot, "features", "workspace", "workspace.module.css"),
    "utf8"
  );
  const templateLibrarySource = readFileSync(
    join(webRoot, "features", "resource-settings", "template-library.ts"),
    "utf8"
  );

  assert.doesNotMatch(layout, /pretendard\/dist\/web/);
  assert.doesNotMatch(packageJson, /"pretendard"\s*:/);
  assert.equal(existsSync(join(localFontDirectory, "LICENSE.txt")), true);
  for (const [fileName, expectedSize] of localFontFiles) {
    const localFontPath = join(localFontDirectory, fileName);
    assert.equal(existsSync(localFontPath), true, `${fileName} must be self-hosted`);
    assert.equal(statSync(localFontPath).size, expectedSize);
    assert.match(
      globalStyles,
      new RegExp(
        `src:\\s*url\\("/fonts/line-seed/${fileName.replace(".", "\\.")}"\\) format\\("woff2"\\);`
      )
    );
  }
  assert.equal(
    [...globalStyles.matchAll(/@font-face\s*\{[^}]*font-family:\s*"LINE Seed Sans KR";/gs)]
      .length,
    localFontFiles.size
  );
  assert.match(globalStyles, /--font-sans:\s*"LINE Seed Sans KR",\s*sans-serif;/);
  assert.match(globalStyles, /--font-code:\s*var\(--font-sans\);/);
  assert.match(landingStyles, /--landing-font:\s*var\(--font-sans\);/);
  assert.match(diagramStyles, /--workspace-font:\s*var\(--font-sans\);/);
  assert.match(aiWorkbenchStyles, /--ai-workbench-font:\s*var\(--font-sans\);/);
  assert.match(
    templateLibrarySource,
    /cdn\.jsdelivr\.net\/npm\/@kfonts\/line-seed-sans-kr@0\.1\.0\/index\.css/
  );
  assert.match(templateLibrarySource, /font:400 22px\/1\.6 'LINE Seed Sans KR',sans-serif/);
  assert.match(templateLibrarySource, /h1\{font-size:38px;font-weight:700\}/);
  assert.match(
    globalStyles,
    /code,[\s\S]*kbd,[\s\S]*pre,[\s\S]*samp\s*\{[^}]*font-family:\s*var\(--font-sans\);/s
  );
  assert.match(
    globalStyles,
    /button,[\s\S]*input,[\s\S]*select,[\s\S]*textarea\s*\{[^}]*font:\s*inherit;/s
  );
  assert.equal(
    [
      ...terraformEditorStyles.matchAll(
        /font-family\s*:\s*"SFMono-Regular", Consolas, "Liberation Mono", monospace;/g
      )
    ].length,
    3
  );
  assert.equal(
    [
      ...workspaceStyles.matchAll(
        /font-family\s*:\s*"SFMono-Regular", Consolas, "Liberation Mono", monospace;/g
      )
    ].length,
    1
  );
  assert.match(
    workspaceStyles,
    /\.deploymentLogList\s*\{[^}]*font-family:\s*"SFMono-Regular", Consolas, "Liberation Mono", monospace;/s
  );

  const forbiddenFallbacks =
    /Inter|Geist|SFMono|Consolas|Liberation Mono|ui-monospace|monospace|Noto Sans KR|Pretendard|Spoqa/;

  for (const cssFile of cssFiles) {
    const styles = readFileSync(cssFile, "utf8");
    if (cssFile !== join(webRoot, "app", "globals.css")) {
      assert.doesNotMatch(styles, /@font-face/, `${cssFile}: use the single global font source`);
    }
    const declarations = styles.matchAll(/font-family\s*:\s*([^;}]+)(?=[;}])/g);

    for (const declaration of declarations) {
      const value = (declaration[1] ?? "").trim();

      if (
        value === legacyCodeFontStack &&
        (cssFile.endsWith("TerraformCodeEditorSurface.module.css") ||
          cssFile.endsWith("workspace.module.css"))
      ) {
        continue;
      }

      assert.doesNotMatch(
        value,
        forbiddenFallbacks,
        `${cssFile}: font-family must resolve to LINE Seed Sans KR or the scoped legacy code stack: ${declaration[0]}`
      );
    }
  }

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const declarations = source.matchAll(/fontFamily\s*:\s*([^,}\r\n]+)/g);

    for (const declaration of declarations) {
      const value = declaration[1] ?? "";
      assert.match(
        value,
        /--workspace-font|--font-sans/,
        `${sourceFile}: inline fontFamily must resolve to the LINE Seed token: ${declaration[0]}`
      );
    }
  }
});
