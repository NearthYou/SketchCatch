param(
  [string]$ApiBaseUrl = "https://sketchcatch.net",

  [string]$AccessToken,

  [string]$HandoffId,

  [string]$StaticSiteUrl,

  [string]$ExpectedStaticMarker,

  [string]$DeployedApiBaseUrl,

  [string]$ExpectedApiMarker,

  [int]$TimeoutMinutes = 30,

  [int]$PollSeconds = 30,

  [string]$ReportPath,

  [switch]$PreflightOnly,

  [switch]$FailOnBlocked,

  [switch]$ConfirmLiveMutations,

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
    [string]$Path,

    [object]$Body = $null
  )

  $baseUrl = $ApiBaseUrl.TrimEnd("/")
  $headers = @{
    Authorization = "Bearer $AccessToken"
  }

  $params = @{
    Method = $Method
    Uri = "$baseUrl$Path"
    Headers = $headers
    ContentType = "application/json"
  }

  if ($null -ne $Body) {
    $params["Body"] = $Body | ConvertTo-Json -Depth 8 -Compress
  }

  return Invoke-RestMethod @params
}

function Test-HasValue {
  param(
    [string]$Value
  )

  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Add-Step {
  param(
    [ValidateNotNull()]
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

function Write-SmokeReport {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Report
  )

  $json = $Report | ConvertTo-Json -Depth 8

  if (Test-HasValue $ReportPath) {
    $parentPath = Split-Path -Parent $ReportPath

    if (Test-HasValue $parentPath) {
      New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
    }

    $reportFullPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReportPath)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($reportFullPath, "$json$([Environment]::NewLine)", $utf8NoBom)
  }

  $json
}

function Get-SmokeErrorEvidence {
  param(
    [object]$ErrorRecord
  )

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message
  }

  if ($ErrorRecord.Exception -and $ErrorRecord.Exception.Response) {
    try {
      $stream = $ErrorRecord.Exception.Response.GetResponseStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $body = $reader.ReadToEnd()

      if (Test-HasValue $body) {
        return $body
      }
    } catch {
      return $ErrorRecord.Exception.Message
    }
  }

  return $ErrorRecord.Exception.Message
}

function Stop-SmokeWithFailedReport {
  param(
    [object]$PipelineStatus = $null
  )

  $report = [ordered]@{
    kind = "sketchcatch_git_cicd_auto_deploy_smoke"
    mode = "live"
    status = "failed"
    handoffId = $HandoffId
    startedAt = $startedAt
    finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    pipelineStatus = $PipelineStatus
    steps = $steps
  }

  Write-SmokeReport -Report $report
  exit 1
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
$preflightBlocked = $false

try {
  $healthResponse = Invoke-WebRequest -Method "GET" -Uri "$($ApiBaseUrl.TrimEnd("/"))/health" -UseBasicParsing
  Add-Step -Steps $steps -Name "api_health" -Status "passed" -Evidence "HTTP $($healthResponse.StatusCode)"
} catch {
  $preflightBlocked = $true
  Add-Step -Steps $steps -Name "api_health" -Status "blocked" -Evidence $_.Exception.Message
}

if (-not (Test-HasValue $AccessToken)) {
  $preflightBlocked = $true
  Add-Step -Steps $steps -Name "access_token" -Status "blocked" -Evidence "AccessToken is required for live smoke API calls"
} else {
  Add-Step -Steps $steps -Name "access_token" -Status "passed" -Evidence "present"
}

if (-not (Test-HasValue $HandoffId)) {
  $preflightBlocked = $true
  Add-Step -Steps $steps -Name "handoff_id" -Status "blocked" -Evidence "HandoffId is required for live smoke API calls"
} else {
  Add-Step -Steps $steps -Name "handoff_id" -Status "passed" -Evidence $HandoffId
}

if (-not $SkipRepositorySettingsApply -or -not $SkipAwsRoleDiffApply) {
  if (-not $ConfirmLiveMutations) {
    $preflightBlocked = $true
    Add-Step -Steps $steps -Name "live_mutation_approval" -Status "blocked" -Evidence "ConfirmLiveMutations is required before repository settings or AWS role diff apply"
  } else {
    Add-Step -Steps $steps -Name "live_mutation_approval" -Status "passed" -Evidence "ConfirmLiveMutations was set"
  }
} else {
  Add-Step -Steps $steps -Name "live_mutation_approval" -Status "skipped" -Evidence "Mutation steps are skipped"
}

if ($RequirePipelineSuccess) {
  Add-Step -Steps $steps -Name "pipeline_success_gate" -Status "passed" -Evidence "This run will wait for pipeline_success up to $TimeoutMinutes minutes"
} else {
  Add-Step -Steps $steps -Name "pipeline_success_gate" -Status "skipped" -Evidence "RequirePipelineSuccess was not set"
}

if ($RequireDestroySuccess) {
  Add-Step -Steps $steps -Name "destroy_success_gate" -Status "passed" -Evidence "This run will require destroy workflow success"
} else {
  Add-Step -Steps $steps -Name "destroy_success_gate" -Status "skipped" -Evidence "RequireDestroySuccess was not set"
}

if ($PreflightOnly -or $preflightBlocked) {
  $preflightStatus = if ($preflightBlocked) { "blocked" } else { "ready" }
  $preflightReport = [ordered]@{
    kind = "sketchcatch_git_cicd_auto_deploy_smoke"
    mode = "preflight"
    status = $preflightStatus
    handoffId = $HandoffId
    startedAt = $startedAt
    finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    pipelineStatus = $null
    steps = $steps
  }

  Write-SmokeReport -Report $preflightReport

  if ($preflightBlocked -and $FailOnBlocked) {
    exit 1
  }

  exit 0
}

if (-not $SkipRepositorySettingsApply) {
  try {
    $settings = Invoke-SketchCatchApi -Method "POST" -Path "/api/git-cicd-handoffs/$HandoffId/repository-settings/apply" -Body @{}
    Add-Step -Steps $steps -Name "repository_settings_apply" -Status "passed" -Evidence "$($settings.variables.Count) variables applied"
  } catch {
    Add-Step -Steps $steps -Name "repository_settings_apply" -Status "failed" -Evidence (Get-SmokeErrorEvidence $_)
  }
} else {
  Add-Step -Steps $steps -Name "repository_settings_apply" -Status "skipped" -Evidence "SkipRepositorySettingsApply was set"
}

if (-not $SkipAwsRoleDiffApply) {
  try {
    $roleDiff = Invoke-SketchCatchApi -Method "POST" -Path "/api/git-cicd-handoffs/$HandoffId/aws-role-diff/apply" -Body @{}
    Add-Step -Steps $steps -Name "aws_role_diff_apply" -Status "passed" -Evidence "verified=$($roleDiff.verified)"
  } catch {
    Add-Step -Steps $steps -Name "aws_role_diff_apply" -Status "failed" -Evidence (Get-SmokeErrorEvidence $_)
  }
} else {
  Add-Step -Steps $steps -Name "aws_role_diff_apply" -Status "skipped" -Evidence "SkipAwsRoleDiffApply was set"
}

$setupFailed = @($steps | Where-Object { $_.status -eq "failed" })
if ($setupFailed.Count -gt 0) {
  Stop-SmokeWithFailedReport
}

try {
  $pipelineStatus = Wait-PipelineStatus
  $statusEvidence = Get-StepStatus -PipelineStatus $pipelineStatus
  Add-Step -Steps $steps -Name "pipeline_status" -Status $statusEvidence.summary -Evidence $statusEvidence.runUrl
  Add-Step -Steps $steps -Name "infra_pipeline_status" -Status $statusEvidence.infra -Evidence $statusEvidence.infraRunUrl
  Add-Step -Steps $steps -Name "app_pipeline_status" -Status $statusEvidence.app -Evidence $statusEvidence.appRunUrl
  Add-Step -Steps $steps -Name "destroy_pipeline_status" -Status $statusEvidence.destroy -Evidence $statusEvidence.destroyRunUrl
} catch {
  $statusEvidence = [ordered]@{
    summary = "failed"
    infra = "failed"
    app = "not_started"
    destroy = "not_started"
    runUrl = ""
    infraRunUrl = ""
    appRunUrl = ""
    destroyRunUrl = ""
    staticSiteUrl = ""
    apiBaseUrl = ""
    message = $_.Exception.Message
  }
  Add-Step -Steps $steps -Name "pipeline_status" -Status "failed" -Evidence $_.Exception.Message
}

if ($RequirePipelineSuccess -and $statusEvidence.summary -ne "pipeline_success") {
  Add-Step -Steps $steps -Name "pipeline_success_required" -Status "failed" -Evidence "Current status: $($statusEvidence.summary)"
  Stop-SmokeWithFailedReport -PipelineStatus $statusEvidence
}

if ($RequireDestroySuccess -and $statusEvidence.destroy -ne "success") {
  Add-Step -Steps $steps -Name "destroy_success_required" -Status "failed" -Evidence "Current status: $($statusEvidence.destroy)"
  Stop-SmokeWithFailedReport -PipelineStatus $statusEvidence
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
$blocked = @($steps | Where-Object { $_.status -eq "blocked" })
$summaryStatus = if ($failed.Count -gt 0) {
  "failed"
} elseif ($blocked.Count -gt 0) {
  "blocked"
} else {
  "passed_or_waiting"
}

$report = [ordered]@{
  kind = "sketchcatch_git_cicd_auto_deploy_smoke"
  mode = "live"
  status = $summaryStatus
  handoffId = $HandoffId
  startedAt = $startedAt
  finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  pipelineStatus = $statusEvidence
  steps = $steps
}

Write-SmokeReport -Report $report

if ($failed.Count -gt 0) {
  exit 1
}

if ($blocked.Count -gt 0 -and $FailOnBlocked) {
  exit 1
}
