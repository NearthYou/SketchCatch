param(
  [string]$ApiBaseUrl = $env:API_BASE_URL,
  [string]$AccessToken = $env:ACCESS_TOKEN,
  [string]$SmokeEmail = $env:SMOKE_EMAIL,
  [string]$SmokePassword = $env:SMOKE_PASSWORD,
  [string]$SmokeCreateUser = $env:SMOKE_CREATE_USER,
  [string]$AwsConnectionId = $env:AWS_CONNECTION_ID,
  [string]$SmokeAccountId = $env:SMOKE_ACCOUNT_ID,
  [string]$AwsRegion = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "ap-northeast-2" }),
  [string]$ReportPath = $env:SMOKE_REPORT_PATH,
  [int]$PollTimeoutSeconds = 1200,
  [int]$PollIntervalSeconds = 5,
  [switch]$SkipDestroy
)

$ErrorActionPreference = "Stop"

if (-not $ApiBaseUrl) {
  throw "API_BASE_URL is required."
}

if (-not $AwsConnectionId) {
  throw "AWS_CONNECTION_ID is required. Prepare a verified AWS connection in SketchCatch before running this smoke."
}

if (-not $SmokeAccountId) {
  throw "SMOKE_ACCOUNT_ID is required for unique resource names."
}

$apiRoot = $ApiBaseUrl.TrimEnd("/")
if (-not $apiRoot.EndsWith("/api")) {
  $apiRoot = "$apiRoot/api"
}

$shortRunId = ([Guid]::NewGuid().ToString("N")).Substring(0, 8).ToLowerInvariant()
$safeRegion = $AwsRegion.ToLowerInvariant()
$bucketName = "sketchcatch-demo-$SmokeAccountId-$safeRegion-$shortRunId".ToLowerInvariant()
$namePrefix = "sc-demo-$shortRunId"
$projectName = "SketchCatch demo web service $shortRunId"

if (-not $ReportPath) {
  $ReportPath = Join-Path $env:TEMP "sketchcatch-demo-web-service-$shortRunId.json"
}

function Invoke-SketchCatchApi {
  param(
    [ValidateSet("GET", "POST", "PUT", "DELETE", "PATCH")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [switch]$NoAuth
  )

  $headers = @{
    Accept = "application/json"
  }

  if (-not $NoAuth) {
    if (-not $script:AccessToken) {
      throw "ACCESS_TOKEN is not available."
    }

    $headers.Authorization = "Bearer $script:AccessToken"
  }

  $invokeParams = @{
    Method = $Method
    Uri = "$apiRoot$Path"
    Headers = $headers
  }

  if ($null -ne $Body) {
    $headers["Content-Type"] = "application/json"
    $invokeParams.Body = ($Body | ConvertTo-Json -Depth 40)
  } elseif ($Method -in @("POST", "PUT", "PATCH")) {
    $headers["Content-Type"] = "application/json"
    $invokeParams.Body = "{}"
  }

  Invoke-RestMethod @invokeParams
}

function Resolve-ProjectAssetUpload {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Upload
  )

  $headers = @{}
  foreach ($property in $Upload.headers.PSObject.Properties) {
    $headers[$property.Name] = [string]$property.Value
  }

  $url = [string]$Upload.url
  if ($url.StartsWith("/api/")) {
    if (-not $script:AccessToken) {
      throw "ACCESS_TOKEN is not available."
    }

    $headers.Authorization = "Bearer $script:AccessToken"
    return @{
      Url = "$apiRoot$($url.Substring(4))"
      Headers = $headers
      ContentType = [string]$headers["Content-Type"]
    }
  }

  return @{
    Url = $url
    Headers = $headers
    ContentType = [string]$headers["Content-Type"]
  }
}

function Get-SmokeAccessToken {
  if ($script:AccessToken) {
    return
  }

  if (-not $SmokeEmail -or -not $SmokePassword) {
    throw "ACCESS_TOKEN is empty. Provide SMOKE_EMAIL and SMOKE_PASSWORD, or set ACCESS_TOKEN."
  }

  $username = ($SmokeEmail.Split("@")[0] -replace "[^a-zA-Z0-9_-]", "-")
  if ($username.Length -lt 3) {
    $username = "smoke-$shortRunId"
  }
  if ($username.Length -gt 30) {
    $username = $username.Substring(0, 30)
  }

  try {
    $login = Invoke-SketchCatchApi -Method POST -Path "/auth/login" -NoAuth -Body @{
      username = $username
      password = $SmokePassword
      rememberMe = $false
    }
    $script:AccessToken = $login.session.accessToken
    return
  } catch {
    if ($SmokeCreateUser -ne "true") {
      throw
    }
  }

  Invoke-SketchCatchApi -Method POST -Path "/auth/signup" -NoAuth -Body @{
    username = $username
    email = $SmokeEmail
    nickname = "Smoke $shortRunId"
    password = $SmokePassword
    privacyAccepted = $true
    termsAccepted = $true
  } | Out-Null

  $loginAfterSignup = Invoke-SketchCatchApi -Method POST -Path "/auth/login" -NoAuth -Body @{
    username = $username
    password = $SmokePassword
    rememberMe = $false
  }
  $script:AccessToken = $loginAfterSignup.session.accessToken
}

function New-ManagedDemoUserDataBase64 {
  $hashPrefix = "sketchcatch-demo-managed-user-data-sha256:"
  $template = @'
#!/bin/bash
# sketchcatch-demo-managed-user-data:v1
# sketchcatch-demo-managed-user-data-sha256:
set -euo pipefail
dnf install -y python3
cat >/opt/sketchcatch-demo-api.py <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import time

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/health"):
            body = json.dumps({
                "ok": True,
                "instance": os.uname().nodename,
                "path": self.path,
                "time": int(time.time())
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
PY
cat >/etc/systemd/system/sketchcatch-demo-api.service <<'UNIT'
[Unit]
Description=SketchCatch demo API
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/sketchcatch-demo-api.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now sketchcatch-demo-api.service
'@
  $normalized = ($template -replace "`r`n", "`n") -replace "`r", "`n"
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$normalized`n"))
  } finally {
    $sha256.Dispose()
  }
  $hash = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
  $script = $normalized -replace "# $hashPrefix", "# $hashPrefix$hash"

  [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("$script`n"))
}

function New-DemoTerraform {
  param(
    [string]$Bucket,
    [string]$Region,
    [string]$RunId,
    [string]$Prefix
  )

  $userDataBase64 = New-ManagedDemoUserDataBase64

@"
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "$Region"
}

resource "aws_vpc" "demo" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "$Prefix-vpc"
    SketchCatchDemo = "true"
    SketchCatchRunId = "$RunId"
  }
}

resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id

  tags = {
    Name = "$Prefix-igw"
    SketchCatchDemo = "true"
  }
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = "${Region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "$Prefix-public-a"
    SketchCatchDemo = "true"
  }
}

resource "aws_subnet" "public_c" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.42.2.0/24"
  availability_zone       = "${Region}c"
  map_public_ip_on_launch = true

  tags = {
    Name = "$Prefix-public-c"
    SketchCatchDemo = "true"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.demo.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }

  tags = {
    Name = "$Prefix-public-rt"
    SketchCatchDemo = "true"
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_c" {
  subnet_id      = aws_subnet.public_c.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "$Prefix-alb"
  description = "SketchCatch demo ALB"
  vpc_id      = aws_vpc.demo.id

  ingress {
    description = "Allow demo HTTP traffic from the internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow outbound traffic for demo health checks"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "$Prefix-alb-sg"
    SketchCatchDemo = "true"
  }
}

resource "aws_security_group" "api" {
  name        = "$Prefix-api"
  description = "SketchCatch demo API"
  vpc_id      = aws_vpc.demo.id

  ingress {
    description     = "Allow demo API traffic from the ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Allow outbound package and metadata access"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "$Prefix-api-sg"
    SketchCatchDemo = "true"
  }
}

resource "aws_s3_bucket" "site" {
  bucket        = "$Bucket"
  force_destroy = true

  tags = {
    Name = "$Prefix-site"
    SketchCatchDemo = "true"
    SketchCatchRunId = "$RunId"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "PublicReadGetObject"
        Effect = "Allow"
        Principal = "*"
        Action = "s3:GetObject"
        Resource = "`${aws_s3_bucket.site.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.site]
}

resource "aws_s3_object" "index" {
  bucket       = aws_s3_bucket.site.id
  key          = "index.html"
  content_type = "text/html"
  content      = "<!doctype html><html><head><meta charset=\"utf-8\"><title>SketchCatch demo</title></head><body><h1>SketchCatch demo web service</h1><img src=\"/logo.svg\" width=\"120\" alt=\"SketchCatch\"><p id=\"api\">API: http://`${aws_lb.demo.dns_name}/api/health</p><script>fetch('http://`${aws_lb.demo.dns_name}/api/health').then(r=>r.json()).then(d=>document.body.insertAdjacentHTML('beforeend','<pre>'+JSON.stringify(d,null,2)+'</pre>')).catch(e=>document.body.insertAdjacentHTML('beforeend','<pre>'+e+'</pre>'));</script></body></html>"
}

resource "aws_s3_object" "logo" {
  bucket       = aws_s3_bucket.site.id
  key          = "logo.svg"
  content_type = "image/svg+xml"
  content      = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 120\"><rect width=\"120\" height=\"120\" rx=\"18\" fill=\"#172033\"/><path d=\"M24 70 52 30l44 60H38l16-22 12 16h10L52 50 34 78h44l-8-12\" fill=\"#38bdf8\"/></svg>"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_launch_template" "api" {
  name_prefix   = "$Prefix-api-"
  image_id      = data.aws_ami.al2023.id
  instance_type = "t3.micro"
  user_data = "$userDataBase64"

  vpc_security_group_ids = [aws_security_group.api.id]

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name = "$Prefix-api"
      SketchCatchDemo = "true"
      SketchCatchRunId = "$RunId"
    }
  }
}

resource "aws_lb" "demo" {
  name               = "$Prefix-alb"
  load_balancer_type = "application"
  drop_invalid_header_fields = true
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_c.id]

  tags = {
    Name = "$Prefix-alb"
    SketchCatchDemo = "true"
  }
}

resource "aws_lb_target_group" "api" {
  name     = "$Prefix-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.demo.id

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.demo.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_autoscaling_group" "api" {
  name                = "$Prefix-asg"
  min_size            = 2
  max_size            = 4
  desired_capacity    = 2
  vpc_zone_identifier = [aws_subnet.public_a.id, aws_subnet.public_c.id]
  target_group_arns   = [aws_lb_target_group.api.arn]
  health_check_type   = "ELB"

  launch_template {
    id      = aws_launch_template.api.id
    version = "`$Latest"
  }

  tag {
    key                 = "Name"
    value               = "$Prefix-api"
    propagate_at_launch = true
  }
}

output "static_site_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "static_site_url" {
  value = "http://`${aws_s3_bucket_website_configuration.site.website_endpoint}"
}

output "alb_dns_name" {
  value = aws_lb.demo.dns_name
}

output "api_base_url" {
  value = "http://`${aws_lb.demo.dns_name}"
}

output "asg_name" {
  value = aws_autoscaling_group.api.name
}
"@
}

function Wait-DeploymentStatus {
  param(
    [string]$DeploymentId,
    [string[]]$TerminalStatuses,
    [string]$Label
  )

  $deadline = (Get-Date).AddSeconds($PollTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $deploymentResponse = Invoke-SketchCatchApi -Method GET -Path "/deployments/$DeploymentId"
    $deployment = $deploymentResponse.deployment

    if ($TerminalStatuses -contains $deployment.status) {
      return $deployment
    }

    Start-Sleep -Seconds $PollIntervalSeconds
  }

  throw "$Label timed out after $PollTimeoutSeconds seconds."
}

function Get-OutputValue {
  param(
    [object[]]$Outputs,
    [string]$Name
  )

  $output = $Outputs | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if (-not $output -or $output.sensitive) {
    return $null
  }

  [string]$output.value
}

function Approve-DeploymentWarnings {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Deployment
  )

  $acknowledgedWarningIds = @()
  if ($Deployment.planSummary -and $Deployment.planSummary.warnings) {
    $acknowledgedWarningIds = @(
      $Deployment.planSummary.warnings |
        Where-Object { $_.requiresAcknowledgement -eq $true } |
        ForEach-Object { [string]$_.id }
    )
  }

  Invoke-SketchCatchApi -Method POST -Path "/deployments/$($Deployment.id)/approve" -Body @{
    acknowledgedWarningIds = $acknowledgedWarningIds
  } | Out-Null
}

Get-SmokeAccessToken

$terraformCode = New-DemoTerraform -Bucket $bucketName -Region $AwsRegion -RunId $shortRunId -Prefix $namePrefix
$terraformBytes = [System.Text.Encoding]::UTF8.GetBytes($terraformCode)

$projectResponse = Invoke-SketchCatchApi -Method POST -Path "/projects" -Body @{
  name = $projectName
  description = "Live demo web service smoke generated by scripts/smoke/live-demo-web-service.ps1"
}
$project = $projectResponse.project

$architectureResponse = Invoke-SketchCatchApi -Method POST -Path "/projects/$($project.id)/architectures" -Body @{
  source = "smoke"
  architectureJson = @{
    nodes = @(
      @{ id = "site"; type = "S3"; label = $bucketName; positionX = 0; positionY = 0; config = @{ bucketName = $bucketName; region = $AwsRegion } },
      @{ id = "api"; type = "EC2"; label = "$namePrefix-api"; positionX = 240; positionY = 0; config = @{ instanceType = "t3.micro"; desiredCapacity = 2 } },
      @{ id = "alb"; type = "UNKNOWN"; label = "$namePrefix-alb"; positionX = 120; positionY = 120; config = @{} }
    )
    edges = @()
  }
}
$architecture = $architectureResponse.architecture

$uploadResponse = Invoke-SketchCatchApi -Method POST -Path "/projects/$($project.id)/assets/presigned-upload" -Body @{
  architectureId = $architecture.id
  assetType = "terraform_file"
  fileName = "main.tf"
  contentType = "text/plain"
  byteSize = $terraformBytes.Length
}

$uploadTarget = Resolve-ProjectAssetUpload -Upload $uploadResponse.upload

Invoke-RestMethod -Method PUT -Uri $uploadTarget.Url -Headers $uploadTarget.Headers -ContentType $uploadTarget.ContentType -Body $terraformBytes | Out-Null

$assetResponse = Invoke-SketchCatchApi -Method POST -Path "/projects/$($project.id)/assets/$($uploadResponse.asset.id)/confirm-upload"
$terraformAsset = $assetResponse.asset

$deploymentResponse = Invoke-SketchCatchApi -Method POST -Path "/projects/$($project.id)/deployments" -Body @{
  architectureId = $architecture.id
  terraformArtifactId = $terraformAsset.id
  awsConnectionId = $AwsConnectionId
  liveProfile = "demo_web_service"
}
$deployment = $deploymentResponse.deployment

Invoke-SketchCatchApi -Method POST -Path "/deployments/$($deployment.id)/init" | Out-Null
$deployment = Wait-DeploymentStatus -DeploymentId $deployment.id -TerminalStatuses @("PENDING", "FAILED", "CANCELLED") -Label "init"
if ($deployment.status -ne "PENDING") {
  throw "init failed with status $($deployment.status): $($deployment.errorSummary)"
}

Invoke-SketchCatchApi -Method POST -Path "/deployments/$($deployment.id)/plan" | Out-Null
$deployment = Wait-DeploymentStatus -DeploymentId $deployment.id -TerminalStatuses @("PENDING", "FAILED", "CANCELLED") -Label "plan"
if ($deployment.status -ne "PENDING") {
  throw "plan failed with status $($deployment.status): $($deployment.errorSummary)"
}

Approve-DeploymentWarnings -Deployment $deployment
Invoke-SketchCatchApi -Method POST -Path "/deployments/$($deployment.id)/apply" | Out-Null
$deployment = Wait-DeploymentStatus -DeploymentId $deployment.id -TerminalStatuses @("SUCCESS", "FAILED", "CANCELLED") -Label "apply"
if ($deployment.status -ne "SUCCESS") {
  throw "apply failed with status $($deployment.status): $($deployment.errorSummary)"
}

$resourcesResponse = Invoke-SketchCatchApi -Method GET -Path "/deployments/$($deployment.id)/resources"
$outputsResponse = Invoke-SketchCatchApi -Method GET -Path "/deployments/$($deployment.id)/outputs"
$logsResponse = Invoke-SketchCatchApi -Method GET -Path "/deployments/$($deployment.id)/logs"
$staticSiteUrl = Get-OutputValue -Outputs $outputsResponse.outputs -Name "static_site_url"
$apiBaseUrl = Get-OutputValue -Outputs $outputsResponse.outputs -Name "api_base_url"
$asgName = Get-OutputValue -Outputs $outputsResponse.outputs -Name "asg_name"

if (-not $staticSiteUrl) {
  throw "static_site_url output was not found."
}
if (-not $apiBaseUrl) {
  throw "api_base_url output was not found."
}
if (-not $asgName) {
  throw "asg_name output was not found."
}

$siteResponse = Invoke-WebRequest -UseBasicParsing -Uri $staticSiteUrl -TimeoutSec 30
if ($siteResponse.StatusCode -lt 200 -or $siteResponse.StatusCode -ge 300) {
  throw "Static site returned HTTP $($siteResponse.StatusCode)."
}

$apiHealth = Invoke-RestMethod -Uri "$($apiBaseUrl.TrimEnd('/'))/api/health" -TimeoutSec 30
if ($apiHealth.ok -ne $true) {
  throw "API health did not return ok=true."
}

$destroyStatus = "SKIPPED"
if (-not $SkipDestroy) {
  Invoke-SketchCatchApi -Method POST -Path "/deployments/$($deployment.id)/destroy/plan" | Out-Null
  $deployment = Wait-DeploymentStatus -DeploymentId $deployment.id -TerminalStatuses @("SUCCESS", "FAILED", "CANCELLED") -Label "destroy plan"
  if ($deployment.status -ne "SUCCESS") {
    throw "destroy plan failed with status $($deployment.status): $($deployment.errorSummary)"
  }

  Approve-DeploymentWarnings -Deployment $deployment
  Invoke-SketchCatchApi -Method POST -Path "/deployments/$($deployment.id)/destroy" | Out-Null
  $deployment = Wait-DeploymentStatus -DeploymentId $deployment.id -TerminalStatuses @("DESTROYED", "FAILED", "CANCELLED") -Label "destroy"
  if ($deployment.status -ne "DESTROYED") {
    throw "destroy failed with status $($deployment.status): $($deployment.errorSummary)"
  }
  $destroyStatus = $deployment.status
}

$report = [ordered]@{
  bucketName = $bucketName
  deploymentId = $deployment.id
  staticSiteUrl = $staticSiteUrl
  apiBaseUrl = $apiBaseUrl
  asgName = $asgName
  resourceCount = $resourcesResponse.resources.Count
  outputCount = $outputsResponse.outputs.Count
  logCount = $logsResponse.logs.Count
  applyStatus = "SUCCESS"
  destroyStatus = $destroyStatus
}

$reportJson = $report | ConvertTo-Json -Depth 10
Set-Content -Path $ReportPath -Value $reportJson -Encoding utf8

Write-Host "SketchCatch live demo web service smoke completed."
Write-Host "Static site: $staticSiteUrl"
Write-Host "API: $apiBaseUrl/api/health"
Write-Host "ASG: $asgName"
Write-Host "Deployment: $($deployment.id)"
Write-Host "Report: $ReportPath"
