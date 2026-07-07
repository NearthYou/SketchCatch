param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AccessToken,

  [Parameter(Mandatory = $true)]
  [string]$HandoffId,

  [string]$StaticSiteUrl,

  [string]$ExpectedStaticMarker,

  [string]$DeployedApiBaseUrl,

  [string]$ExpectedApiMarker,

  [int]$TimeoutMinutes = 30,

  [int]$PollSeconds = 30,

  [switch]$RequirePipelineSuccess,

  [switch]$RequireDestroySuccess,

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

function Get-StepStatus {
  param(
    [Parameter(Mandatory = $true)]
    [object]$PipelineStatus
  )

  return [ordered]@{
    summary = [string]$PipelineStatus.status
    infra = [string]$PipelineStatus.infraPipelineStatus
    app = [string]$PipelineStatus.appPipelineStatus
    destroy = [string]$PipelineStatus.destroyPipelineStatus
    runUrl = [string]$PipelineStatus.pipelineRunUrl
    infraRunUrl = [string]$PipelineStatus.infraPipelineRunUrl
    appRunUrl = [string]$PipelineStatus.appPipelineRunUrl
    destroyRunUrl = [string]$PipelineStatus.destroyPipelineRunUrl
    staticSiteUrl = [string]$PipelineStatus.staticSiteUrl
    apiBaseUrl = [string]$PipelineStatus.apiBaseUrl
    message = [string]$PipelineStatus.statusMessage
  }
}

function Wait-PipelineStatus {
  $deadline = (Get-Date).ToUniversalTime().AddMinutes($TimeoutMinutes)
  $latest = $null

  do {
    $pipeline = Invoke-SketchCatchApi -Method "GET" -Path "/api/git-cicd-handoffs/$HandoffId/pipeline-status"
    $latest = $pipeline.pipelineStatus
    $summary = [string]$latest.status

    if ($summary -in @("pipeline_success", "pipeline_failed", "cancelled")) {
      return $latest
    }

    if (-not $RequirePipelineSuccess) {
      return $latest
    }

    Start-Sleep -Seconds $PollSeconds
  } while ((Get-Date).ToUniversalTime() -lt $deadline)

  return $latest
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

$pipelineStatus = Wait-PipelineStatus
$statusEvidence = Get-StepStatus -PipelineStatus $pipelineStatus
Add-Step -Steps $steps -Name "pipeline_status" -Status $statusEvidence.summary -Evidence $statusEvidence.runUrl
Add-Step -Steps $steps -Name "infra_pipeline_status" -Status $statusEvidence.infra -Evidence $statusEvidence.infraRunUrl
Add-Step -Steps $steps -Name "app_pipeline_status" -Status $statusEvidence.app -Evidence $statusEvidence.appRunUrl
Add-Step -Steps $steps -Name "destroy_pipeline_status" -Status $statusEvidence.destroy -Evidence $statusEvidence.destroyRunUrl

if ($RequirePipelineSuccess -and $statusEvidence.summary -ne "pipeline_success") {
  throw "Pipeline did not reach pipeline_success. Current status: $($statusEvidence.summary)."
}

if ($RequireDestroySuccess -and $statusEvidence.destroy -ne "success") {
  throw "Destroy workflow did not reach success. Current status: $($statusEvidence.destroy)."
}

if (-not $StaticSiteUrl -and $statusEvidence.staticSiteUrl) {
  $StaticSiteUrl = $statusEvidence.staticSiteUrl
}

if (-not $DeployedApiBaseUrl -and $statusEvidence.apiBaseUrl) {
  $DeployedApiBaseUrl = $statusEvidence.apiBaseUrl
}

if (-not $SkipUrlCheck -and $StaticSiteUrl) {
  $staticResponse = Invoke-WebRequest -Method "GET" -Uri $StaticSiteUrl -UseBasicParsing
  $staticBody = [string]$staticResponse.Content

  if ($ExpectedStaticMarker -and -not $staticBody.Contains($ExpectedStaticMarker)) {
    throw "Static site response did not include the expected marker."
  }

  Add-Step -Steps $steps -Name "static_site_url" -Status "passed" -Evidence "HTTP $($staticResponse.StatusCode)"
} elseif ($SkipUrlCheck) {
  Add-Step -Steps $steps -Name "static_site_url" -Status "skipped" -Evidence "SkipUrlCheck was set"
} else {
  Add-Step -Steps $steps -Name "static_site_url" -Status "skipped" -Evidence "StaticSiteUrl was not provided and handoff did not expose one"
}

if (-not $SkipUrlCheck -and $DeployedApiBaseUrl) {
  $apiResponse = Invoke-WebRequest -Method "GET" -Uri $DeployedApiBaseUrl -UseBasicParsing
  $apiBody = [string]$apiResponse.Content

  if ($ExpectedApiMarker -and -not $apiBody.Contains($ExpectedApiMarker)) {
    throw "API response did not include the expected marker."
  }

  Add-Step -Steps $steps -Name "api_base_url" -Status "passed" -Evidence "HTTP $($apiResponse.StatusCode)"
} elseif ($SkipUrlCheck) {
  Add-Step -Steps $steps -Name "api_base_url" -Status "skipped" -Evidence "SkipUrlCheck was set"
} else {
  Add-Step -Steps $steps -Name "api_base_url" -Status "skipped" -Evidence "DeployedApiBaseUrl was not provided and handoff did not expose one"
}

$failed = @($steps | Where-Object { $_.status -in @("pipeline_failed", "failed", "cancelled") })
$summaryStatus = if ($failed.Count -gt 0) { "failed" } else { "passed_or_waiting" }

$report = [ordered]@{
  kind = "sketchcatch_git_cicd_auto_deploy_smoke"
  status = $summaryStatus
  handoffId = $HandoffId
  startedAt = $startedAt
  finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  pipelineStatus = $statusEvidence
  steps = $steps
}

$report | ConvertTo-Json -Depth 8
