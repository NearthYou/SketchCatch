import type { ArchitectureJson, ResourceType } from "@sketchcatch/types";

export type ArchitectureRealtimeMode = "none" | "chat" | "notification" | "data_updates";
export type ArchitectureRealtimeTransport = "websocket" | "sse" | "polling" | undefined;

export type ArchitectureOperationalRequirements = {
  readonly availability: "99" | "99.9" | "99.99" | undefined;
  readonly burstTraffic: boolean;
  readonly httpsRequired: boolean;
  readonly realtime: ArchitectureRealtimeMode | undefined;
  readonly realtimeTransport: ArchitectureRealtimeTransport;
  readonly voiceTranscription: boolean;
};

export type ArchitectureValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly string[] };

const RUNTIME_RESOURCE_TYPES = new Set<ResourceType>(["ECS_SERVICE", "EC2", "LAMBDA"]);

export function resolveArchitectureOperationalRequirements(
  prompt: string
): ArchitectureOperationalRequirements {
  const normalizedPrompt = prompt.normalize("NFKC").toLowerCase();

  return {
    availability: resolveAvailability(normalizedPrompt),
    burstTraffic: /(bursty|event\s+spike|unpredictable|급변동|이벤트성\s*급증|예측\s*불가)/iu.test(
      normalizedPrompt
    ),
    httpsRequired:
      !/(https|ssl)[\s\S]{0,24}(선택|필요\s*없|없음|optional|not required)/iu.test(normalizedPrompt) &&
      /((https|ssl)[\s\S]{0,24}(필수|중요|required|mandatory)|보안[\s\S]{0,16}(필수|중요))/iu.test(
        normalizedPrompt
      ),
    realtime: resolveRealtimeMode(normalizedPrompt),
    realtimeTransport: resolveRealtimeTransport(normalizedPrompt),
    voiceTranscription: /(\b(voice|speech|audio)\b|음성|녹음|전사)/iu.test(
      normalizedPrompt
    )
  };
}

export function applyArchitectureOperationalPolicy(
  architectureJson: ArchitectureJson,
  requirements: ArchitectureOperationalRequirements
): ArchitectureJson {
  const nodes = [...architectureJson.nodes];
  const edges = [...architectureJson.edges];
  const runtime = nodes.find((node) => RUNTIME_RESOURCE_TYPES.has(node.type));

  applyRealtimeFlow(edges, nodes, requirements, runtime?.id);
  applyBurstScalingPolicy(nodes, requirements);
  applyAvailabilityPolicy(nodes, requirements);

  if (!requirements.voiceTranscription || runtime === undefined) {
    return { nodes, edges };
  }

  let audioBucket = nodes.find(
    (node) => node.type === "S3" && node.config.bucketPurpose === "voice_audio"
  );
  if (audioBucket === undefined) {
    audioBucket = {
      id: createUniqueNodeId(nodes, "voice-audio-bucket"),
      type: "S3",
      label: "Private Voice Audio Bucket",
      positionX: runtime.positionX + 260,
      positionY: runtime.positionY,
      config: {
        bucketPrefix: "sketchcatch-voice-audio-",
        bucketPurpose: "voice_audio",
        forceDestroy: false,
        publicAccessBlock: true
      }
    };
    nodes.push(audioBucket);
  }

  let transcribePolicy = nodes.find(
    (node) => node.type === "IAM_POLICY" && /transcribe:/iu.test(String(node.config.policy ?? ""))
  );
  if (transcribePolicy === undefined) {
    transcribePolicy = {
      id: createUniqueNodeId(nodes, "voice-transcribe-policy"),
      type: "IAM_POLICY",
      label: "Voice Transcription Policy",
      positionX: runtime.positionX + 260,
      positionY: runtime.positionY + 140,
      config: {
        name: "sketchcatch-voice-transcription",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["transcribe:GetTranscriptionJob", "transcribe:StartTranscriptionJob"],
              Resource: "*"
            },
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:PutObject"],
              Resource: "*"
            }
          ]
        })
      }
    };
    nodes.push(transcribePolicy);
  }

  addEdge(edges, audioBucket.id, runtime.id, "audio upload event");
  addEdge(edges, transcribePolicy.id, runtime.id, "allows Amazon Transcribe API");
  addEdge(edges, runtime.id, audioBucket.id, "stores transcription result");

  return { nodes, edges };
}

export function validateArchitectureOperationalRequirements(
  requirements: ArchitectureOperationalRequirements,
  architectureJson: ArchitectureJson
): ArchitectureValidationResult {
  const issues: string[] = [];
  const nodes = architectureJson.nodes;
  const edges = architectureJson.edges;
  const publicLoadBalancer = nodes.find(
    (node) => node.type === "LOAD_BALANCER" && node.config.internal !== true
  );

  if (requirements.httpsRequired && publicLoadBalancer !== undefined) {
    const hasCertificate = nodes.some((node) => node.type === "ACM_CERTIFICATE");
    const hasHttpsListener = nodes.some(
      (node) =>
        node.type === "LOAD_BALANCER_LISTENER" &&
        node.config.protocol === "HTTPS" &&
        node.config.port === 443 &&
        typeof node.config.certificateArn === "string"
    );
    if (!hasCertificate || !hasHttpsListener) {
      issues.push("HTTPS requires an ACM certificate and a port 443 load balancer listener.");
    }
  }

  if (requirements.realtimeTransport === "sse") {
    if (requirements.realtime === "notification") {
      const hasSsePath = edges.some(
        (edge) => /\bsse\b/iu.test(edge.label ?? "") && /(notification|notify|events?|alert|알림)/iu.test(edge.label ?? "")
      );
      if (!hasSsePath) {
        issues.push("SSE notification behavior requires an explicit SSE event notification path.");
      }
    } else {
      const hasSsePath = edges.some(
        (edge) => /\bsse\b/iu.test(edge.label ?? "") && /post|message|메시지/iu.test(edge.label ?? "")
      );
      if (!hasSsePath) {
        issues.push("HTTP message submission with SSE requires explicit POST and SSE event paths.");
      }
    }
  }

  if (
    requirements.realtimeTransport === "websocket" &&
    !edges.some((edge) => /web\s*socket|websocket|웹소켓/iu.test(edge.label ?? ""))
  ) {
    issues.push("WebSocket realtime behavior requires an explicit upgrade or connection path.");
  }

  if (
    requirements.realtimeTransport === "polling" &&
    !edges.some((edge) => /polling|polls|폴링/iu.test(edge.label ?? ""))
  ) {
    issues.push("Polling behavior requires an explicit client polling path.");
  }

  if (
    requirements.burstTraffic &&
    nodes.some((node) => node.type === "ECS_SERVICE") &&
    (!nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET") ||
      !nodes.some((node) => node.type === "APPLICATION_AUTO_SCALING_POLICY"))
  ) {
    issues.push("Bursty ECS traffic requires an Application Auto Scaling target and policy.");
  }

  if (
    requirements.burstTraffic &&
    nodes.some((node) => node.type === "EC2") &&
    (!nodes.some((node) => node.type === "AUTO_SCALING_GROUP") ||
      !nodes.some((node) => node.type === "AUTO_SCALING_POLICY"))
  ) {
    issues.push("Bursty EC2 traffic requires an Auto Scaling Group and scaling policy.");
  }

  if (requirements.availability === "99.99") {
    const ecsService = nodes.find((node) => node.type === "ECS_SERVICE");
    const ec2Count = nodes.filter((node) => node.type === "EC2").length;
    const hasRedundantRuntime =
      nodes.some((node) => node.type === "LAMBDA") ||
      (nodes.some((node) => node.type === "CLOUDFRONT") &&
        nodes.some((node) => node.type === "S3")) ||
      (ecsService !== undefined && Number(ecsService.config.desiredCount ?? 0) >= 2) ||
      nodes.some(
        (node) =>
          node.type === "AUTO_SCALING_GROUP" &&
          Math.max(
            Number(node.config.minSize ?? 0),
            Number(node.config.desiredCapacity ?? 0)
          ) >= 2
      ) ||
      (ec2Count >= 2 && nodes.some((node) => node.type === "AUTO_SCALING_GROUP"));
    const database = nodes.find((node) => node.type === "RDS");

    if (!hasRedundantRuntime) {
      issues.push("99.99% availability requires a redundant or managed multi-instance runtime.");
    }
    if (database !== undefined && database.config.multiAz !== true) {
      issues.push("99.99% availability with RDS requires Multi-AZ database deployment.");
    }
  }

  if (requirements.voiceTranscription) {
    const audioBucket = nodes.find(
      (node) => node.type === "S3" && node.config.bucketPurpose === "voice_audio"
    );
    const runtime = nodes.find((node) => RUNTIME_RESOURCE_TYPES.has(node.type));
    const policy = nodes.find(
      (node) => node.type === "IAM_POLICY" && /transcribe:StartTranscriptionJob/iu.test(String(node.config.policy ?? ""))
    );
    const hasAudioFlow =
      audioBucket !== undefined &&
      runtime !== undefined &&
      edges.some(
        (edge) =>
          ((edge.sourceId === audioBucket.id && edge.targetId === runtime.id) ||
            (edge.sourceId === runtime.id && edge.targetId === audioBucket.id)) &&
          /(audio|voice|transcription|음성|전사)/iu.test(edge.label ?? "")
      );
    if (audioBucket === undefined || runtime === undefined || policy === undefined || !hasAudioFlow) {
      issues.push(
        "Voice transcription requires private audio storage, a runtime, Transcribe IAM permission, and an explicit audio flow."
      );
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function applyRealtimeFlow(
  edges: ArchitectureJson["edges"],
  nodes: ArchitectureJson["nodes"],
  requirements: ArchitectureOperationalRequirements,
  runtimeId: string | undefined
): void {
  if (requirements.realtimeTransport === undefined) {
    return;
  }

  const listener = nodes.find((node) => node.type === "LOAD_BALANCER_LISTENER");
  const target = nodes.find((node) => node.type === "LOAD_BALANCER_TARGET_GROUP");
  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  const entry =
    listener ??
    nodes.find((node) =>
      ["API_GATEWAY_REST_API", "API_GATEWAY_V2_API", "CLOUDFRONT"].includes(node.type)
    );
  const destinationId = target?.id ?? autoScalingGroup?.id ?? runtimeId;

  if (entry === undefined || destinationId === undefined) {
    return;
  }

  const label =
    requirements.realtimeTransport === "sse"
      ? requirements.realtime === "notification"
        ? "SSE /events notification stream"
        : "POST /messages + SSE /events"
      : requirements.realtimeTransport === "websocket"
        ? "WebSocket upgrade"
        : "client polling";
  addEdge(edges, entry.id, destinationId, label);
}

function applyBurstScalingPolicy(
  nodes: ArchitectureJson["nodes"],
  requirements: ArchitectureOperationalRequirements
): void {
  if (!requirements.burstTraffic) {
    return;
  }

  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  if (
    autoScalingGroup !== undefined &&
    !nodes.some((node) => node.type === "AUTO_SCALING_POLICY")
  ) {
    nodes.push({
      id: createUniqueNodeId(nodes, "app-scaling-policy"),
      type: "AUTO_SCALING_POLICY",
      label: "Burst Traffic Scaling Policy",
      positionX: autoScalingGroup.positionX,
      positionY: Math.max(...nodes.map((node) => node.positionY)) + 220,
      config: {
        adjustmentType: "ChangeInCapacity",
        autoscalingGroupName: `aws_autoscaling_group.${toTerraformName(autoScalingGroup.id)}.name`,
        cooldown: 60,
        name: "burst-traffic-scale-out",
        policyType: "SimpleScaling",
        scalingAdjustment: 1
      }
    });
  }
}

function applyAvailabilityPolicy(
  nodes: ArchitectureJson["nodes"],
  requirements: ArchitectureOperationalRequirements
): void {
  if (requirements.availability !== "99.99") {
    return;
  }

  const ecsService = nodes.find((node) => node.type === "ECS_SERVICE");
  if (ecsService !== undefined && Number(ecsService.config.desiredCount ?? 0) < 2) {
    ecsService.config = { ...ecsService.config, desiredCount: 2 };
  }

  const autoScalingGroup = nodes.find((node) => node.type === "AUTO_SCALING_GROUP");
  if (autoScalingGroup !== undefined) {
    autoScalingGroup.config = {
      ...autoScalingGroup.config,
      desiredCapacity: Math.max(2, Number(autoScalingGroup.config.desiredCapacity ?? 0)),
      minSize: Math.max(2, Number(autoScalingGroup.config.minSize ?? 0))
    };
  }
}

function resolveRealtimeMode(normalizedPrompt: string): ArchitectureRealtimeMode | undefined {
  if (/^실시간\s*채팅$/imu.test(normalizedPrompt)) return "chat";
  if (/^실시간\s*알림$/imu.test(normalizedPrompt)) return "notification";
  if (/(실시간[\s\S]{0,80}(필요\s*없음|없음)|no\s+real[-\s]*time)/iu.test(normalizedPrompt)) return "none";
  if (/(notification|notify|알림)/iu.test(normalizedPrompt)) return "notification";
  if (/실시간[\s\S]{0,20}(필요\s*없|없음)|no\s+real[-\s]*time/iu.test(normalizedPrompt)) {
    return "none";
  }
  if (/(chat|채팅)/iu.test(normalizedPrompt)) return "chat";
  if (/(data\s+updates?|주식|게임|데이터\s*업데이트)/iu.test(normalizedPrompt)) return "data_updates";
  if (/(notification|notify|알림)/iu.test(normalizedPrompt)) return "notification";
  return undefined;
}

function resolveRealtimeTransport(normalizedPrompt: string): ArchitectureRealtimeTransport {
  if (/(websocket|web\s*socket|웹소켓)/iu.test(normalizedPrompt)) return "websocket";
  if (/(server-sent|\bsse\b|sse\s*수신)/iu.test(normalizedPrompt)) return "sse";
  if (/(polling|폴링)/iu.test(normalizedPrompt)) return "polling";
  return undefined;
}

function resolveAvailability(
  normalizedPrompt: string
): ArchitectureOperationalRequirements["availability"] {
  if (/(99\.99|절대\s*안됨|no[-\s]*downtime)/iu.test(normalizedPrompt)) return "99.99";
  if (/(99\.9|월\s*1시간)/iu.test(normalizedPrompt)) return "99.9";
  if (/(99%|월\s*8시간)/iu.test(normalizedPrompt)) return "99";
  return undefined;
}

function createUniqueNodeId(nodes: ArchitectureJson["nodes"], baseId: string): string {
  const ids = new Set(nodes.map((node) => node.id));
  let id = baseId;
  let suffix = 2;
  while (ids.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function toTerraformName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/gu, "_").replace(/^([0-9])/u, "_$1");
}

function addEdge(
  edges: ArchitectureJson["edges"],
  sourceId: string,
  targetId: string,
  label: string
): void {
  if (edges.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId && edge.label === label)) {
    return;
  }
  edges.push({
    id: `operational-${sourceId}-to-${targetId}-${edges.length + 1}`,
    sourceId,
    targetId,
    label
  });
}
