param(
  [switch]$Verify,
  [switch]$Full,
  [switch]$Start
)

Set-StrictMode -Version Latest
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

  $featureList = Get-Content -Encoding UTF8 -Raw -LiteralPath "feature_list.json" | ConvertFrom-Json
  $activeFeatures = @($featureList.features | Where-Object { $_.status -eq "in_progress" })
  if ($activeFeatures.Count -gt 1) {
    $ids = ($activeFeatures | ForEach-Object { $_.id }) -join ", "
    throw "Only one feature may be in_progress. Active features: $ids"
  }

  $passingWithoutEvidence = @(
    $featureList.features |
      Where-Object {
        $_.status -eq "passing" -and
        (-not $_.evidence -or -not $_.evidence.lastVerified -or -not $_.evidence.commands -or $_.evidence.commands.Count -eq 0)
      }
  )
  if ($passingWithoutEvidence.Count -gt 0) {
    $ids = ($passingWithoutEvidence | ForEach-Object { $_.id }) -join ", "
    throw "Passing features require evidence.lastVerified and commands: $ids"
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
