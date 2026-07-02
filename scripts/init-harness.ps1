param(
  [switch]$Verify,
  [switch]$Full,
  [switch]$Start
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Push-Location $repoRoot
try {
  Write-Host "[harness:init] Repository root: $repoRoot"

  $requiredFiles = @(
    "AGENTS.md",
    "agent-progress.md",
    "feature_list.json",
    "session-handoff.md",
    "clean-state-checklist.md",
    "evaluator-rubric.md",
    "quality-document.md",
    "package.json",
    "pnpm-workspace.yaml"
  )

  foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
      throw "Missing required harness file: $file"
    }
  }

  Get-Command node -ErrorAction Stop | Out-Null
  Get-Command pnpm -ErrorAction Stop | Out-Null
  & node scripts/check-harness.mjs

  if ($Full) {
    & pnpm lint
    & pnpm typecheck
    & pnpm build
  } elseif ($Verify) {
    & pnpm lint
    & pnpm typecheck
  }

  if ($Start) {
    & pnpm dev
  } else {
    Write-Host "[harness:init] Start command: pnpm dev"
    Write-Host "[harness:init] Verification commands: pnpm lint; pnpm typecheck; pnpm build"
  }
} finally {
  Pop-Location
}
