param(
  [string]$AwsRegion = "ap-northeast-2",
  [string]$ClusterName,
  [string]$ServiceName,
  [string]$WorkerTaskDefinition,
  [string]$EcsBaseUrl,
  [string]$ReportPath,
  [switch]$PreflightOnly,
  [switch]$ReadOnlyAws,
  [switch]$CheckHttp
)

$ErrorActionPreference = "Stop"

if ($PreflightOnly -and $ReadOnlyAws) {
  throw "Use either -PreflightOnly or -ReadOnlyAws, not both."
}

$checks = [System.Collections.Generic.List[object]]::new()
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Add-Check {
  param(
    [string]$Name,
    [ValidateSet("passed", "failed", "skipped")]
    [string]$Status,
    [string]$Evidence
  )

  $checks.Add([ordered]@{
    name = $Name
    status = $Status
    evidence = $Evidence
  }) | Out-Null
}

function Test-FileContains {
  param(
    [string]$RelativePath,
    [string[]]$Patterns,
    [string]$CheckName
  )

  $path = Join-Path $repositoryRoot $RelativePath

  if (-not (Test-Path -LiteralPath $path)) {
    Add-Check -Name $CheckName -Status "failed" -Evidence "Missing $RelativePath"
    return
  }

  $content = Get-Content -LiteralPath $path -Raw
  $missingPatterns = @($Patterns | Where-Object { -not $content.Contains($_) })

  if ($missingPatterns.Count -gt 0) {
    Add-Check -Name $CheckName -Status "failed" -Evidence "Missing markers: $($missingPatterns -join ', ')"
    return
  }

  Add-Check -Name $CheckName -Status "passed" -Evidence $RelativePath
}

function Invoke-AwsJson {
  param([string[]]$Arguments)

  $output = & aws @Arguments --region $AwsRegion --output json

  if ($LASTEXITCODE -ne 0) {
    throw "AWS read-only command failed: aws $($Arguments -join ' ')"
  }

  return $output | ConvertFrom-Json
}

Test-FileContains `
  -RelativePath "infra/aws/terraform/observability.tf" `
  -Patterns @("aws_cloudwatch_log_metric_filter", "ecs_container_errors", "ecs_unhealthy_hosts") `
  -CheckName "CloudWatch observability template"
Test-FileContains `
  -RelativePath "infra/aws/terraform/locals.tf" `
  -Patterns @("/ecs/api", "/ecs/web", "/ecs/nginx", "/ecs/worker") `
  -CheckName "API, web, nginx, worker log groups"
Test-FileContains `
  -RelativePath "infra/aws/terraform/variables.tf" `
  -Patterns @('variable "enable_ecs_observability_alarms"', "default     = false") `
  -CheckName "Opt-in alarm cost gate"
Test-FileContains `
  -RelativePath ".github/workflows/deploy-ecs.yml" `
  -Patterns @("workflow_dispatch:", "cancel-in-progress: false", "environment: production") `
  -CheckName "Manual ECS deployment workflow gate"
Test-FileContains `
  -RelativePath ".github/workflows/migrate.yml" `
  -Patterns @("workflow_dispatch:", "environment: production", "Run migrations on EC2 with SSM") `
  -CheckName "Manual migration workflow gate"
Test-FileContains `
  -RelativePath "infra/aws/terraform/variables.tf" `
  -Patterns @('variable "create_route53_alias"', "default     = false") `
  -CheckName "Route53 cutover defaults off"

if ($ReadOnlyAws) {
  foreach ($requiredValue in @{
    ClusterName = $ClusterName
    ServiceName = $ServiceName
  }.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($requiredValue.Value)) {
      throw "$($requiredValue.Key) is required with -ReadOnlyAws."
    }
  }

  if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI is required with -ReadOnlyAws."
  }

  $serviceResult = Invoke-AwsJson @(
    "ecs", "describe-services", "--cluster", $ClusterName, "--services", $ServiceName
  )
  $service = @($serviceResult.services)[0]

  if ($null -eq $service -or @($serviceResult.failures).Count -gt 0) {
    Add-Check -Name "ECS service status" -Status "failed" -Evidence "Service was not found or describe-services returned failures."
  } else {
    Add-Check -Name "ECS service status" -Status "passed" -Evidence "status=$($service.status), running=$($service.runningCount), desired=$($service.desiredCount)"
  }

  $taskList = Invoke-AwsJson @(
    "ecs", "list-tasks", "--cluster", $ClusterName, "--service-name", $ServiceName
  )
  $taskArns = @($taskList.taskArns)

  if ($taskArns.Count -gt 0) {
    $taskResult = Invoke-AwsJson (@(
      "ecs", "describe-tasks", "--cluster", $ClusterName, "--tasks"
    ) + $taskArns)
    $taskStates = @($taskResult.tasks | ForEach-Object { $_.lastStatus }) -join ","
    Add-Check -Name "ECS app task status" -Status "passed" -Evidence "tasks=$($taskArns.Count), states=$taskStates"
  } else {
    Add-Check -Name "ECS app task status" -Status "failed" -Evidence "No service tasks were returned."
  }

  if (-not [string]::IsNullOrWhiteSpace($WorkerTaskDefinition)) {
    $workerDefinition = Invoke-AwsJson @(
      "ecs", "describe-task-definition", "--task-definition", $WorkerTaskDefinition
    )
    Add-Check -Name "Worker task definition" -Status "passed" -Evidence $workerDefinition.taskDefinition.taskDefinitionArn
  } else {
    Add-Check -Name "Worker task definition" -Status "skipped" -Evidence "WorkerTaskDefinition was not provided."
  }

  $logGroups = Invoke-AwsJson @(
    "logs", "describe-log-groups", "--log-group-name-prefix", "/sketchcatch/"
  )
  $expectedSuffixes = @("/ecs/api", "/ecs/web", "/ecs/nginx", "/ecs/worker")
  $logGroupNames = @($logGroups.logGroups | ForEach-Object { $_.logGroupName })
  $missingLogGroups = @($expectedSuffixes | Where-Object {
    $suffix = $_
    -not ($logGroupNames | Where-Object { $_.EndsWith($suffix) })
  })
  Add-Check `
    -Name "CloudWatch log groups" `
    -Status $(if ($missingLogGroups.Count -eq 0) { "passed" } else { "failed" }) `
    -Evidence $(if ($missingLogGroups.Count -eq 0) { "All expected log groups exist." } else { "Missing: $($missingLogGroups -join ', ')" })
} else {
  Add-Check -Name "AWS read-only inspection" -Status "skipped" -Evidence "Preflight mode does not contact AWS."
}

if ($CheckHttp) {
  if ([string]::IsNullOrWhiteSpace($EcsBaseUrl)) {
    throw "EcsBaseUrl is required with -CheckHttp."
  }

  $baseUrl = $EcsBaseUrl.TrimEnd("/")
  foreach ($path in @("/", "/health", "/health/db")) {
    $response = Invoke-WebRequest -Uri "$baseUrl$path" -Method Get -UseBasicParsing -TimeoutSec 15
    Add-Check -Name "HTTP $path" -Status "passed" -Evidence "status=$($response.StatusCode)"
  }
} else {
  Add-Check -Name "ECS HTTP health" -Status "skipped" -Evidence "Use -CheckHttp with the parallel ECS ALB URL."
}

$failedChecks = @($checks | Where-Object { $_.status -eq "failed" })
$report = [ordered]@{
  mode = $(if ($ReadOnlyAws) { "read_only_aws" } else { "preflight" })
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  mutationCommandsExecuted = $false
  checks = $checks
  gatedNextSteps = @(
    "Run database migration only through the approved manual production workflow.",
    "Run worker RunTask smoke only after task definition, IAM, network, cost, and cleanup approval.",
    "Switch Route53 only after ECS app and worker smoke pass; keep EC2 rollback available."
  )
}
$reportJson = $report | ConvertTo-Json -Depth 8

if (-not [string]::IsNullOrWhiteSpace($ReportPath)) {
  $reportJson | Set-Content -LiteralPath $ReportPath -Encoding utf8
}

$reportJson

if ($failedChecks.Count -gt 0) {
  throw "ECS operations preflight failed with $($failedChecks.Count) failed check(s)."
}
