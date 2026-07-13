# Brainboard capture evidence tooling

These scripts validate and normalize the committed Brainboard capture evidence without changing the raw files in `docs/gg/feat-infrastructure-template/brainboard-captures/`.

## Safety boundary

Never click or invoke Brainboard **Plan**, **Apply**, or **Deploy** while collecting or checking this evidence. Capture stops after `Use template` → `Create architecture`, the Design SVG, and the Code pane. A failed clone stays failed evidence; do not invent a graph or Terraform source from its preview.

The JSON files under `brainboard-captures/` are immutable inputs. Both CLIs are read-only for that directory, and generated-output options reject a path inside it. The capture index stores the SHA-256 of every raw file.

## Verify the committed corpus

From the repository root:

```bash
node --test scripts/brainboard-capture/*.test.mjs
node scripts/brainboard-capture/validate-capture.mjs
node scripts/brainboard-capture/validate-capture.mjs --check-status
node scripts/brainboard-capture/normalize-capture.mjs
node scripts/brainboard-capture/normalize-capture.mjs --check-report
```

`validate-capture.mjs` exits nonzero for integrity errors. Its expected warnings are raw evidence, not validation failures: 43 two-node parent cycles, 59 inverted smaller-parent links, 9 exact semantic duplicate-edge pairs, 10 nonzero rotations, 11 empty text nodes, 2 shape-style gaps, 5 empty `undefined.tf` files, and the 341 visual AWS nodes versus 331 Terraform addresses.

Use `--json` on either CLI for the deterministic machine-readable report. Regenerate the committed projections only after reviewing the raw evidence and index:

```bash
node scripts/brainboard-capture/validate-capture.mjs --write-status
node scripts/brainboard-capture/normalize-capture.mjs --write-report
```

These commands produce:

- `docs/gg/feat-infrastructure-template/brainboard-capture-status.json`
- `docs/gg/feat-infrastructure-template/brainboard-capture-normalization-report.json`

Generation is validity-gated. `--write-status` does not create or change a status file when capture validation fails. Normalization verifies every raw file byte hash against the immutable index before parsing any capture; `--json`, `--write-report`, and `--check-report` all stop before report output or report-file access when a hash differs.

## Validation contract

Validation checks the exact 24-entry package manifest/index metadata and download order, 23 captured plus one failed record, raw/diagram/Terraform aggregate hashes, every Terraform file hash, unique contiguous ranks and DOM orders, unique IDs/files/addresses, dangling parents and edge endpoints, finite viewBox/node geometry/rotation/edge points, authored endpoint-to-waypoint equality, and endpoint proximity to its referenced node.

The failed `09fd3420-d8f0-409c-a1cc-694dba97443f` record must retain its exact Brainboard source-UUID linkage, an `attemptedAt` date equal to the index `capturedAt` date, its HTTPS preview URL at exactly 3840×2160, all four reviewed attempt records and results, the final `Clone into current architecture` action, and a non-empty final error. It must not gain `provider`, `viewport`, `nodes`, `edges`, or `terraform` fields.

Visual-node/Terraform-address mapping is audit-only here. The tool reports exact title/name matches, type-level single candidates, missing types, one-address/multi-visual groups, and ambiguous groups. It never pairs ambiguous arrays by index.

## Normalization contract

`normalizeCapture` returns a new object and never mutates its input:

- `viewBox` decimals become finite `{ x, y, width, height }` numbers without rounding.
- Nodes use the source-contract terminology `domOrder`, `label`, `size`, `rawTransform`, `rotation`, and `zIndex`. `zIndex` equals DOM order. Until reviewed Terraform/presentation mapping exists, every node is explicitly `kind: "unresolved"` with `rawResourceType`; no resource identity is guessed.
- Edges use `sourceEdgeId`, `domOrder`, explicit `sourcePoint`/`targetPoint`, and DOM-order `zIndex`. Arrow direction comes from the marker rotation center matching the authored source or target point; the finite angle and raw arrow are both retained. Parallel edges are never deduplicated.
- Terraform file order, name, code, SHA-256, line count, and `includeInWorkspace` are copied unchanged. Terraform is not parsed into values here, so expressions such as `var.foo`, interpolation, functions, indexes, and heredocs cannot be coerced into plain strings.
- The clone architecture UUID is extracted from the clone board URL. The URL itself remains evidence.

Parent normalization changes only a link whose current parent has a smaller rectangle area than its child:

1. Choose the smallest strictly larger candidate that fully encloses the child.
2. If none exists, use the smallest strictly larger candidate containing the child center, with a documented tolerance of `0.5` SVG units.
3. If no candidate exists, clear only that inverted link to root.
4. Equal-area candidates are listed in DOM order and fail until a reviewed override is supplied. Raw `null` parents and all non-inverted links remain unchanged.
5. Any remaining parent cycle fails normalization.

An override file is keyed first by template ID, then by child source node ID:

```json
{
  "brainboard-example": {
    "child-source-node-id": "reviewed-parent-source-node-id"
  }
}
```

Run it with `--parent-overrides path/to/reviewed-overrides.json`. An override is accepted only when the selected node is already a valid larger full-enclosure or center-containment candidate.

To inspect one capture without writing a file:

```bash
node scripts/brainboard-capture/normalize-capture.mjs --input docs/gg/feat-infrastructure-template/brainboard-captures/aws-rds.json
```
