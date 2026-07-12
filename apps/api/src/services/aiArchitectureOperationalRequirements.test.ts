import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArchitectureJson } from "@sketchcatch/types";
import {
  applyArchitectureOperationalPolicy,
  resolveArchitectureOperationalRequirements,
  validateArchitectureOperationalRequirements
} from "./aiArchitectureOperationalRequirements.js";

test("resolveArchitectureOperationalRequirements distinguishes realtime, burst, HTTPS, availability, and voice", () => {
  const requirements = resolveArchitectureOperationalRequirements([
    "SSL 인증서 HTTPS는 필수",
    "실시간 채팅은 HTTP 메시지 전송 + SSE 수신 경로",
    "트래픽 패턴은 이벤트성 급증",
    "가용성은 99.9%",
    "음성 녹음을 업로드하고 전사한다"
  ].join("\n"));

  assert.deepEqual(requirements, {
    availability: "99.9",
    burstTraffic: true,
    httpsRequired: true,
    realtime: "chat",
    realtimeTransport: "sse",
    voiceTranscription: true
  });
});

test("resolveArchitectureOperationalRequirements detects Korean voice keywords with particles and compounds", () => {
  assert.equal(
    resolveArchitectureOperationalRequirements("사용자가 음성을 업로드하면 전사 결과를 보여줘").voiceTranscription,
    true
  );
  assert.equal(
    resolveArchitectureOperationalRequirements("녹음파일을 Amazon Transcribe로 처리해줘").voiceTranscription,
    true
  );
  assert.equal(
    resolveArchitectureOperationalRequirements("invoice 파일을 업로드해줘").voiceTranscription,
    false
  );
});

test("resolveArchitectureOperationalRequirements maps the Korean SPA questionnaire answers", () => {
  const requirements = resolveArchitectureOperationalRequirements([
    "어떤 종류의 웹사이트인가요?",
    "SPA (Single Page Application) (React/Vue 등)",
    "예상 트래픽 규모는?",
    "중간 규모 (일 1,000명, 동시 50명)",
    "SSL 인증서(HTTPS)가 필요한가요?",
    "선택사항 (HTTP도 괜찮음)",
    "실시간 기능이 필요한가요? (채팅, 알림 등)",
    "실시간 알림",
    "트래픽 패턴은?",
    "이벤트성 급증 (특정 시기에만)",
    "서비스 중단 허용 시간은?",
    "월 1시간 이내 (99.9% 가용성)",
    "실시간 채팅 연결은 어떤 방식으로 표현할까요?",
    "HTTP 메시지 전송 + SSE 수신 경로"
  ].join("\n"));

  assert.deepEqual(requirements, {
    availability: "99.9",
    burstTraffic: true,
    httpsRequired: false,
    realtime: "notification",
    realtimeTransport: "sse",
    voiceTranscription: false
  });
});

test("applyArchitectureOperationalPolicy adds a deployable voice transcription path", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      { id: "ecs", type: "ECS_SERVICE", label: "App", positionX: 0, positionY: 0, config: {} }
    ],
    edges: []
  };
  const requirements = resolveArchitectureOperationalRequirements("음성 파일을 업로드하고 Amazon Transcribe로 전사");
  const applied = applyArchitectureOperationalPolicy(architectureJson, requirements);
  const validation = validateArchitectureOperationalRequirements(requirements, applied);

  assert.ok(applied.nodes.some((node) => node.type === "S3" && node.config.bucketPurpose === "voice_audio"));
  assert.ok(applied.nodes.some((node) => node.type === "IAM_POLICY" && /transcribe:/u.test(String(node.config.policy))));
  assert.ok(applied.edges.some((edge) => /Transcribe/u.test(edge.label ?? "")));
  assert.deepEqual(validation, { ok: true });
});

test("applyArchitectureOperationalPolicy labels SSE notification paths without chat message submission", () => {
  const architectureJson: ArchitectureJson = {
    nodes: [
      { id: "listener", type: "LOAD_BALANCER_LISTENER", label: "ALB HTTPS Listener", positionX: 0, positionY: 0, config: {} },
      { id: "target", type: "LOAD_BALANCER_TARGET_GROUP", label: "App Target Group", positionX: 220, positionY: 0, config: {} },
      { id: "ecs", type: "ECS_SERVICE", label: "App", positionX: 440, positionY: 0, config: {} }
    ],
    edges: []
  };
  const requirements = resolveArchitectureOperationalRequirements(
    "realtime feature: realtime notification\nrealtime notification transport: SSE one-way notification path"
  );
  const applied = applyArchitectureOperationalPolicy(architectureJson, requirements);
  const validation = validateArchitectureOperationalRequirements(requirements, applied);

  assert.equal(requirements.realtime, "notification");
  assert.equal(requirements.realtimeTransport, "sse");
  assert.ok(
    applied.edges.some((edge) => /SSE \/events notification stream/u.test(edge.label ?? ""))
  );
  assert.deepEqual(validation, { ok: true });
});

test("validateArchitectureOperationalRequirements returns typed issues instead of throwing", () => {
  const requirements = resolveArchitectureOperationalRequirements(
    "HTTPS 필수, 실시간 채팅 SSE, 이벤트성 급증, 음성 전사"
  );
  const result = validateArchitectureOperationalRequirements(requirements, {
    nodes: [
      { id: "alb", type: "LOAD_BALANCER", positionX: 0, positionY: 0, config: { internal: false } },
      { id: "ecs", type: "ECS_SERVICE", positionX: 0, positionY: 0, config: {} }
    ],
    edges: []
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues.length, 4);
  }
});

test("resolveArchitectureOperationalRequirements handles realtime transport and availability combinations", () => {
  const cases = [
    ["실시간 채팅, WebSocket 양방향 연결", "chat", "websocket"],
    ["실시간 알림, SSE 단방향 수신", "notification", "sse"],
    ["실시간 데이터 업데이트, 간단 폴링", "data_updates", "polling"],
    ["실시간 기능은 필요 없음", "none", undefined]
  ] as const;

  for (const [prompt, realtime, realtimeTransport] of cases) {
    const requirements = resolveArchitectureOperationalRequirements(prompt);
    assert.equal(requirements.realtime, realtime, prompt);
    assert.equal(requirements.realtimeTransport, realtimeTransport, prompt);
  }

  assert.equal(
    resolveArchitectureOperationalRequirements("서비스 중단 절대 안됨, 99.99% 가용성").availability,
    "99.99"
  );
});

test("validateArchitectureOperationalRequirements checks EC2 burst and 99.99% topology details", () => {
  const requirements = resolveArchitectureOperationalRequirements(
    "이벤트성 급증 트래픽, 99.99% 가용성, 절대 중단 안됨"
  );
  const result = validateArchitectureOperationalRequirements(requirements, {
    nodes: [
      { id: "ec2", type: "EC2", positionX: 0, positionY: 0, config: {} },
      { id: "db", type: "RDS", positionX: 0, positionY: 0, config: { multiAz: false } }
    ],
    edges: []
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /Auto Scaling Group/u.test(issue)));
    assert.ok(result.issues.some((issue) => /redundant/u.test(issue)));
    assert.ok(result.issues.some((issue) => /Multi-AZ/u.test(issue)));
  }
});
