import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerraformHighlightedLines } from "./terraform-code-highlighting";

test("createTerraformHighlightedLines tokenizes Terraform HCL for editor coloring", () => {
  const lines = createTerraformHighlightedLines(
    'resource "aws_route" "route" {\n  route_table_id = aws_route_table.rt.id\n  region = "ap-northeast-2"\n}',
    new Set([2])
  );

  assert.deepEqual(
    lines.map((line) => ({
      hasDiagnostic: line.hasDiagnostic,
      kinds: line.tokens.filter((token) => token.text.trim()).map((token) => token.kind)
    })),
    [
      { hasDiagnostic: false, kinds: ["keyword", "string", "string", "brace"] },
      { hasDiagnostic: true, kinds: ["identifier", "operator", "reference"] },
      { hasDiagnostic: false, kinds: ["identifier", "operator", "string"] },
      { hasDiagnostic: false, kinds: ["brace"] }
    ]
  );
});

test("createTerraformHighlightedLines keeps comments and escaped strings as single tokens", () => {
  const lines = createTerraformHighlightedLines('  name = "web \\"blue\\"" # route name');

  assert.deepEqual(
    lines[0]?.tokens.map((token) => ({ kind: token.kind, text: token.text })),
    [
      { kind: "plain", text: "  " },
      { kind: "identifier", text: "name" },
      { kind: "plain", text: " " },
      { kind: "operator", text: "=" },
      { kind: "plain", text: " " },
      { kind: "string", text: '"web \\"blue\\""' },
      { kind: "plain", text: " " },
      { kind: "comment", text: "# route name" }
    ]
  );
});
