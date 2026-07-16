import assert from "node:assert/strict";
import test from "node:test";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  applyTerraformSafeFixesAtomically,
  type TerraformSafeFixBatchItem
} from "./terraform-safe-fixes";

function diagnostic(
  code: string,
  line: number,
  sourceFileName?: string
): TerraformDiagnostic {
  return {
    code,
    line,
    message: code,
    severity: "error",
    sourceFileName
  };
}

test("여러 파일의 유효한 수정안을 원본 변경 없이 한 번에 반영한다", () => {
  const files = [
    { fileName: "main.tf", code: "name = \"demo\",\n" },
    { fileName: "outputs.tf", code: "value = \"aws_vpc.main.id\"\n" }
  ] as const;
  const originalSnapshot = structuredClone(files);

  const result = applyTerraformSafeFixesAtomically({
    files,
    fixes: [
      {
        diagnostic: diagnostic("terraform.trailing_comma", 1, "main.tf")
      },
      {
        diagnostic: diagnostic("terraform.quoted_reference", 1, "outputs.tf")
      }
    ]
  });

  assert.equal(result.applied, true);
  assert.deepEqual(result.files, [
    { fileName: "main.tf", code: "name = \"demo\"\n" },
    { fileName: "outputs.tf", code: "value = aws_vpc.main.id\n" }
  ]);
  assert.deepEqual(files, originalSnapshot);
  assert.notStrictEqual(result.files, files);
  assert.notStrictEqual(result.files[0], files[0]);
  assert.notStrictEqual(result.files[1], files[1]);
});

test("한 수정이라도 실패하면 모든 파일을 원본 상태로 유지한다", () => {
  const files = [
    { fileName: "main.tf", code: "name = \"demo\",\n" },
    { fileName: "outputs.tf", code: "value = already_valid\n" }
  ] as const;
  const originalSnapshot = structuredClone(files);

  const result = applyTerraformSafeFixesAtomically({
    files,
    fixes: [
      {
        diagnostic: diagnostic("terraform.trailing_comma", 1, "main.tf")
      },
      {
        diagnostic: diagnostic("terraform.quoted_reference", 1, "outputs.tf")
      }
    ]
  });

  assert.equal(result.applied, false);
  assert.strictEqual(result.files, files);
  assert.deepEqual(files, originalSnapshot);
});

test("같은 파일의 줄 삭제는 아래쪽 줄부터 적용해 원래 줄 위치를 보존한다", () => {
  const files = [
    {
      fileName: "main.tf",
      code:
        "keep-1\ntarget\nremove-3\nremove-4\nkeep-5\ntarget\nkeep-7\nkeep-8\nkeep-9\ntarget\nkeep-11\n"
    }
  ] as const;
  const fixes: readonly TerraformSafeFixBatchItem[] = [
    {
      diagnostic: diagnostic("terraform.ai_replacement", 2),
      codePreview: {
        currentCode: "target\nremove-3\nremove-4\n",
        nextCode: "",
        source: "amazon_q",
        sourceLine: 2
      }
    },
    {
      diagnostic: diagnostic("terraform.ai_replacement", 6),
      codePreview: {
        currentCode: "target\n",
        nextCode: "changed-6\n",
        source: "amazon_q",
        sourceLine: 6
      }
    }
  ];

  const result = applyTerraformSafeFixesAtomically({ files, fixes });

  assert.equal(result.applied, true);
  assert.equal(
    result.files[0]?.code,
    "keep-1\nkeep-5\nchanged-6\nkeep-7\nkeep-8\nkeep-9\ntarget\nkeep-11\n"
  );
});

test("동일하거나 겹치는 코드 교체 범위는 원자적으로 거부한다", async (t) => {
  const files = [{ fileName: "main.tf", code: "alpha beta gamma\n" }] as const;

  await t.test("동일 범위", () => {
    const duplicateFix: TerraformSafeFixBatchItem = {
      diagnostic: diagnostic("terraform.ai_replacement", 1),
      codePreview: {
        currentCode: "beta",
        nextCode: "one",
        source: "amazon_q",
        sourceLine: 1
      }
    };
    const result = applyTerraformSafeFixesAtomically({
      files,
      fixes: [duplicateFix, { ...duplicateFix }]
    });

    assert.equal(result.applied, false);
    assert.strictEqual(result.files, files);
    assert.match(result.message, /겹치|중복/);
  });

  await t.test("부분 겹침", () => {
    const result = applyTerraformSafeFixesAtomically({
      files,
      fixes: [
        {
          diagnostic: diagnostic("terraform.ai_replacement", 1),
          codePreview: {
            currentCode: "alpha beta",
            nextCode: "one",
            source: "amazon_q",
            sourceLine: 1
          }
        },
        {
          diagnostic: diagnostic("terraform.ai_replacement", 1),
          codePreview: {
            currentCode: "beta gamma",
            nextCode: "two",
            source: "amazon_q",
            sourceLine: 1
          }
        }
      ]
    });

    assert.equal(result.applied, false);
    assert.strictEqual(result.files, files);
    assert.match(result.message, /겹치|중복/);
  });
});

test("sourceFileName이 없으면 파일이 정확히 하나일 때만 대상을 추론한다", async (t) => {
  await t.test("단일 파일", () => {
    const files = [{ fileName: "main.tf", code: "name = \"demo\",\n" }] as const;
    const result = applyTerraformSafeFixesAtomically({
      files,
      fixes: [
        {
          diagnostic: diagnostic("terraform.trailing_comma", 1)
        }
      ]
    });

    assert.equal(result.applied, true);
    assert.equal(result.files[0]?.code, "name = \"demo\"\n");
  });

  await t.test("여러 파일이면 모호하므로 거부", () => {
    const files = [
      { fileName: "main.tf", code: "name = \"main\",\n" },
      { fileName: "other.tf", code: "name = \"other\",\n" }
    ] as const;
    const result = applyTerraformSafeFixesAtomically({
      files,
      fixes: [
        {
          diagnostic: diagnostic("terraform.trailing_comma", 1)
        }
      ]
    });

    assert.equal(result.applied, false);
    assert.strictEqual(result.files, files);
    assert.match(result.message, /파일.*특정|모호/);
  });
});
