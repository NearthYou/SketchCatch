param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AccessToken,

  [Parameter(Mandatory = $true)]
  [string]$HandoffId,

  [string]$StaticSiteUrl,

  [string]$ExpectedStaticMarker,

  [switch]$SkipRepositorySettingsApply,

  [switch]$SkipAwsRoleDiffApply,

  [switch]$SkipUrlCheck
)

$ErrorActionPreference = "Stop"

function Invoke-SketchCatchApi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $baseUrl = $ApiBaseUrl.TrimEnd("/")
  $headers = @{
    Authorization = "Bearer $AccessToken"
  }

  return Invoke-RestMethod -Method $Method -Uri "$baseUrl$Path" -Headers $headers -ContentType "application/json"
}

function Add-Step {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.Generic.List[object]]$Steps,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Status,

    [string]$Evidence
  )

  $Steps.Add([ordered]@{
    name = $Name
    status = $Status
    evidence = $Evidence
  }) | Out-Null
}

$steps = [System.Collections.Generic.List[object]]::new()
$startedAt = (Get-Date).ToUniversalTime().ToString("o")

if (-not $SkipRepositorySettingsApply) {
  $settings = Invoke-SketchCatchApi -Method "POST" -Path "/api/git-cicd-handoffs/$HandoffId/repository-settings/apply"
  Add-Step -Steps $steps -Name "repository_settings_apply" -Status "passed" -Evidence "$($settings.variables.Count) variables applied"
} else {
  Add-Step -Steps $steps -Name "repository_settings_apply" -Status "skipped" -Evidence "SkipRepositorySettingsApply was set"
}

if (-not $SkipAwsRoleDiffApply) {
  $roleDiff = Invoke-SketchCatchApi -Method "POST" -Path "/api/git-cicd-handoffs/$HandoffId/aws-role-diff/apply"
  Add-Step -Steps $steps -Name "aws_role_diff_apply" -Status "passed" -Evidence "verified=$($roleDiff.verified)"
} else {
  Add-Step -Steps $steps -Name "aws_role_diff_apply" -Status "skipped" -Evidence "SkipAwsRoleDiffApply was set"
}

$pipeline = Invoke-SketchCatchApi -Method "GET" -Path "/api/git-cicd-handoffs/$HandoffId/pipeline-status"
$pipelineStatus = $pipeline.pipelineStatus
Add-Step -Steps $steps -Name "pipeline_status" -Status $pipelineStatus.status -Evidence $pipelineStatus.pipelineRunUrl

if (-not $SkipUrlCheck -and $StaticSiteUrl) {
  $staticResponse = Invoke-WebRequest -Method "GET" -Uri $StaticSiteUrl -UseBasicParsing
  $staticBody = [string]$staticResponse.Content

  if ($ExpectedStaticMarker -and -not $staticBody.Contains($ExpectedStaticMarker)) {
    throw "Static site response did not include the expected marker."
  }

  Add-Step -Steps $steps -Name "static_site_url" -Status "passed" -Evidence "HTTP $($staticResponse.StatusCode)"
} elseif ($SkipUrlCheck) {
  Add-Step -Steps $steps -Name "static_site_url" -Status "skipped" -Evidence "SkipUrlCheck was set"
}

$failed = @($steps | Where-Object { $_.status -in @("pipeline_failed", "failed", "cancelled") })
$summaryStatus = if ($failed.Count -gt 0) { "failed" } else { "passed_or_waiting" }

$report = [ordered]@{
  kind = "sketchcatch_git_cicd_auto_deploy_smoke"
  status = $summaryStatus
  handoffId = $HandoffId
  startedAt = $startedAt
  finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  steps = $steps
}

$report | ConvertTo-Json -Depth 8
