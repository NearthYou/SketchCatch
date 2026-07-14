import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";

const smokeScriptPath = resolve(
  process.cwd(),
  "../../scripts/smoke/live-demo-web-service.ps1"
);
const smokeSource = readFileSync(smokeScriptPath, "utf8");

test("demo web service smoke uses the bounded 1/1/2 ALB ASG scaling structure", () => {
  assert.match(smokeSource, /\$terraformCode = New-DemoTerraformWithAlbAsg/);
  assert.match(smokeSource, /min_size\s*=\s*1/);
  assert.match(smokeSource, /desired_capacity\s*=\s*1/);
  assert.match(smokeSource, /max_size\s*=\s*2/);
  assert.match(smokeSource, /health_check_type\s*=\s*"ELB"/);
  assert.match(smokeSource, /health_check_grace_period\s*=\s*120/);
  assert.match(smokeSource, /deregistration_delay\s*=\s*10/);
  assert.match(smokeSource, /default_instance_warmup\s*=\s*60/);
  assert.match(smokeSource, /resource "aws_autoscaling_policy" "scale_out"/);
  assert.match(smokeSource, /adjustment_type\s*=\s*"ChangeInCapacity"/);
  assert.match(smokeSource, /scaling_adjustment\s*=\s*1/);
  assert.doesNotMatch(smokeSource, /resource "aws_autoscaling_policy" "scale_out"[\s\S]*?cooldown\s*=/);
  assert.match(smokeSource, /estimated_instance_warmup\s*=\s*60/);
  assert.match(smokeSource, /resource "aws_cloudwatch_metric_alarm" "scale_out"/);
  assert.match(smokeSource, /resource "aws_cloudwatch_log_group" "traffic"/);
  assert.match(smokeSource, /resource "aws_iam_role" "api_agent"/);
  assert.match(smokeSource, /resource "aws_iam_role_policy_attachment" "cloudwatch_agent"/);
  assert.match(smokeSource, /resource "aws_iam_instance_profile" "api_agent"/);
  assert.match(smokeSource, /iam_instance_profile\s*\{\s*name = aws_iam_instance_profile\.api_agent\.name\s*\}/);
  assert.match(smokeSource, /amazon-cloudwatch-agent/);
  assert.match(smokeSource, /CloudWatchAgentServerPolicy/);
  assert.match(smokeSource, /metric_name\s*=\s*"RequestCountPerTarget"/);
  assert.match(smokeSource, /statistic\s*=\s*"Sum"/);
  assert.match(smokeSource, /period\s*=\s*60/);
  assert.match(smokeSource, /threshold\s*=\s*60/);
  assert.match(smokeSource, /evaluation_periods\s*=\s*1/);
  assert.match(smokeSource, /datapoints_to_alarm\s*=\s*1/);
  assert.match(smokeSource, /treat_missing_data\s*=\s*"notBreaching"/);
  assert.doesNotMatch(smokeSource, /resource "aws_autoscaling_policy" "scale_in"/);
});

test("demo web service exposes all Live Observation outputs", () => {
  for (const outputName of [
    "static_site_url",
    "api_base_url",
    "asg_name",
    "alb_arn_suffix",
    "target_group_arn_suffix",
    "scale_out_threshold",
    "cloudwatch_agent_log_group_name",
    "cloudwatch_agent_metric_namespace"
  ]) {
    assert.match(smokeSource, new RegExp(`output "${outputName}"`));
  }
});

test("demo web service smoke records an explicit deployment scope and runtime target", () => {
  assert.match(smokeSource, /\[ValidateSet\("infrastructure", "application", "full_stack"\)\]\s*\[string\]\$DeploymentScope/);
  assert.match(smokeSource, /scope\s*=\s*\$DeploymentScope/);
  assert.match(smokeSource, /targetKind\s*=\s*"ec2_asg"/);
});

test("generated smoke Terraform passes the bounded demo safety gate", () => {
  const terraform = extractGeneratedTerraformFixture(smokeSource);

  assert.doesNotThrow(() =>
    assertTerraformArtifactIsSafe(terraform, { liveProfile: "demo_web_service" })
  );
  assert.match(terraform, /replace\(base64decode\("[A-Za-z0-9+/=]+"\), "__TRAFFIC_API_URL__", "http:\/\/\$\{aws_lb\.demo\.dns_name\}\/api\/traffic"\)/);
});

test("demo audience page sends a receipt only after successful Traffic API response", () => {
  assert.match(smokeSource, /id="send-traffic"/);
  assert.match(smokeSource, /\/api\/traffic/);
  assert.match(smokeSource, /response\.ok/);
  assert.match(smokeSource, /\/api\/live-observations\/public\//);
  assert.match(smokeSource, /crypto\.randomUUID\(\)/);
  assert.match(smokeSource, /이 브라우저의 Traffic 성공/);
  assert.match(smokeSource, /Traffic 요청은 성공했지만 실시간 집계에 실패했습니다/);
  assert.match(
    smokeSource,
    /content\s*=\s*replace\(base64decode\("\$audienceHtmlBase64"\), "__TRAFFIC_API_URL__", "http:\/\/`\$\{aws_lb\.demo\.dns_name\}\/api\/traffic"\)/
  );
  assert.match(smokeSource, /const trafficUrl = '__TRAFFIC_API_URL__';/);
  assert.doesNotMatch(smokeSource, /content\s*=\s*<<-HTML/);
});

test("embedded Python Traffic API compiles and exposes OPTIONS, traffic, and health handlers", () => {
  const pythonSource = extractEmbeddedPython(smokeSource);
  const directory = mkdtempSync(join(tmpdir(), "sketchcatch-live-observation-"));
  const pythonPath = join(directory, "traffic_api.py");

  try {
    writeFileSync(pythonPath, pythonSource, "utf8");
    const result = spawnSync("python3", ["-m", "py_compile", pythonPath], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(pythonSource, /def do_OPTIONS\(self\):/);
    assert.match(pythonSource, /def do_POST\(self\):/);
    assert.match(pythonSource, /STATSD_ADDRESS = \("127\.0\.0\.1", 8125\)/);
    assert.match(pythonSource, /traffic\.requests:1\|c/);
    assert.match(pythonSource, /TRAFFIC_LOG_PATH = "\/var\/log\/sketchcatch-demo-api\/traffic\.log"/);
    assert.match(pythonSource, /\/api\/traffic/);
    assert.match(pythonSource, /\/api\/health/);
    assert.doesNotMatch(pythonSource, /sleep\(|cpu|burn/i);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

function extractEmbeddedPython(source: string): string {
  const match = /cat >\/opt\/sketchcatch-demo-api\.py <<'PY'\r?\n([\s\S]*?)\r?\nPY/.exec(source);

  assert.ok(match?.[1], "embedded Python API source was not found");
  return match[1];
}

function extractGeneratedTerraformFixture(source: string): string {
  const terraformMatch =
    /function New-DemoTerraformWithAlbAsg \{[\s\S]*?\r?\n@"\r?\n([\s\S]*?)\r?\n"@\r?\n\}/.exec(
      source
    );
  const userDataMatch =
    /function New-ManagedDemoUserDataBase64 \{[\s\S]*?\$template = @'\r?\n([\s\S]*?)\r?\n'@\r?\n\s+\$template = \$template\.Replace[\s\S]*?\r?\n\s+\$normalized/.exec(
      source
    );
  const audienceMatch =
    /function New-DemoAudienceHtmlBase64 \{[\s\S]*?\$template = @'\r?\n([\s\S]*?)\r?\n'@\r?\n\r?\n\s+\[Convert\]/.exec(
      source
    );

  assert.ok(terraformMatch?.[1], "embedded ALB/ASG Terraform was not found");
  assert.ok(userDataMatch?.[1], "managed user data template was not found");
  assert.ok(audienceMatch?.[1], "audience HTML template was not found");

  const normalizedUserData = `${userDataMatch[1]
    .replaceAll("__TRAFFIC_LOG_GROUP__", "/sketchcatch/demo/sc-demo-test/traffic")
    .replace(/\r\n?/g, "\n")}\n`;
  const hash = createHash("sha256").update(normalizedUserData).digest("hex");
  const userData = normalizedUserData.replace(
    "# sketchcatch-demo-managed-user-data-sha256:",
    `# sketchcatch-demo-managed-user-data-sha256:${hash}`
  );
  const replacements = new Map([
    ["${Region}", "ap-northeast-2"],
    ["$Region", "ap-northeast-2"],
    ["$Prefix", "sc-demo-test"],
    ["$Bucket", "sketchcatch-demo-test-bucket"],
    ["$RunId", "test-run"],
    ["$logGroupName", "/sketchcatch/demo/sc-demo-test/traffic"],
    ["$userDataBase64", Buffer.from(userData, "utf8").toString("base64")],
    ["$audienceHtmlBase64", Buffer.from(audienceMatch[1], "utf8").toString("base64")]
  ]);
  let terraform = terraformMatch[1];

  for (const [from, to] of replacements) {
    terraform = terraform.replaceAll(from, to);
  }

  return terraform.replaceAll("`$", "$");
}
