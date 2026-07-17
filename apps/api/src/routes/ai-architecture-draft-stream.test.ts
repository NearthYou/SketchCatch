import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type {
  ArchitectureDraftProgressSnapshot,
  ArchitectureDraftStreamEvent,
  ArchitectureJson,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse
} from "@sketchcatch/types";
import {
  ArchitectureDraftGenerationError,
  type CreateArchitectureDraftResponseFactory
} from "../services/aiArchitectureDrafts.js";
import { registerAiRoutes } from "./ai.js";

const provisionalArchitectureJson: ArchitectureJson = {
  nodes: [
    {
      id: "candidate-s3",
      type: "S3",
      label: "Static Website Bucket",
      positionX: 120,
      positionY: 180,
      config: {}
    }
  ],
  edges: []
};

const progressSnapshots: ArchitectureDraftProgressSnapshot[] = [
  {
    sequence: 1,
    provisionalArchitectureJson,
    excludableCandidateIds: ["candidate-s3"]
  },
  {
    sequence: 2,
    provisionalArchitectureJson,
    excludableCandidateIds: ["candidate-s3"]
  }
];

const terminalResult: CreateArchitectureDraftResponse = {
  architectureJson: provisionalArchitectureJson,
  title: "Static Website Draft",
  metadata: {
    source: "prompt",
    confidence: "medium",
    assumptions: [],
    explanations: []
  }
};

test("POST /api/ai/architecture-draft/stream serializes complete replacement snapshots and terminal result", async (t) => {
  let receivedRequest: CreateArchitectureDraftRequest | undefined;
  const createArchitectureDraftResponse: CreateArchitectureDraftResponseFactory = (
    request,
    options
  ) => {
    receivedRequest = request;
    for (const snapshot of progressSnapshots) {
      options?.onProgress?.(snapshot);
    }
    return terminalResult;
  };
  const app = await buildAiRouteApp(createArchitectureDraftResponse);
  t.after(() => app.close());

  const candidateExclusions = [
    {
      candidateId: "candidate-s3",
      resourceType: "S3",
      label: "Static Website Bucket"
    }
  ] as const;
  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft/stream",
    payload: {
      prompt: "정적 웹사이트를 만들어 주세요.",
      candidateExclusions
    }
  });
  const events = parseNdjson(response.body);

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /application\/x-ndjson/u);
  assert.deepEqual(receivedRequest?.candidateExclusions, candidateExclusions);
  assert.equal(events.length, 3);
  assert.deepEqual(events.slice(0, 2), [
    {
      type: "progress",
      snapshot: progressSnapshots[0]
    },
    {
      type: "progress",
      snapshot: progressSnapshots[1]
    }
  ]);
  assert.deepEqual(
    events.slice(0, 2).map((event) =>
      event.type === "progress" ? event.snapshot.sequence : null
    ),
    [1, 2]
  );
  assert.deepEqual(Object.keys(progressSnapshots[0]!).sort(), [
    "excludableCandidateIds",
    "provisionalArchitectureJson",
    "sequence"
  ]);
  assert.deepEqual(events[2], { type: "result", result: terminalResult });
});

test("POST /api/ai/architecture-draft/stream keeps post-header errors in terminal NDJSON", async (t) => {
  const createArchitectureDraftResponse: CreateArchitectureDraftResponseFactory = (
    _request,
    options
  ) => {
    options?.onProgress?.(progressSnapshots[0]!);
    throw new ArchitectureDraftGenerationError(
      new Error("provider unavailable"),
      "provider_unavailable"
    );
  };
  const app = await buildAiRouteApp(createArchitectureDraftResponse);
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft/stream",
    payload: { prompt: "정적 웹사이트를 만들어 주세요." }
  });
  const events = parseNdjson(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(events[0]?.type, "progress");
  assert.equal(events[1]?.type, "error");
  if (events[1]?.type !== "error") return;
  assert.equal(events[1].error.statusCode, 503);
  assert.equal(events[1].error.error, "service_unavailable");
});

test("POST /api/ai/architecture-draft validates candidate exclusion limits and fields", async (t) => {
  let callCount = 0;
  const app = await buildAiRouteApp(() => {
    callCount += 1;
    return terminalResult;
  });
  t.after(() => app.close());

  const invalidCandidateExclusions = [
    Array.from({ length: 33 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      resourceType: "S3",
      label: `Candidate ${index}`
    })),
    [{ candidateId: " ", resourceType: "S3", label: "Candidate" }],
    [{ candidateId: "candidate-s3", resourceType: "S3", label: " " }],
    [{ candidateId: "candidate-unknown", resourceType: "NOT_A_RESOURCE", label: "Unknown" }]
  ];

  for (const candidateExclusions of invalidCandidateExclusions) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft",
      payload: {
        prompt: "정적 웹사이트를 만들어 주세요.",
        candidateExclusions
      }
    });

    assert.equal(response.statusCode, 400);
  }
  assert.equal(callCount, 0);
});

test("POST /api/ai/architecture-draft/stream rejects Repository Analysis authority fields", async (t) => {
  let callCount = 0;
  const app = await buildAiRouteApp(() => {
    callCount += 1;
    return terminalResult;
  });
  t.after(() => app.close());

  const authorityFields = [
    {
      repositoryAnalysis: {
        projectId: "11111111-1111-4111-8111-111111111111",
        sourceRepositoryId: "22222222-2222-4222-8222-222222222222"
      }
    },
    {
      repositoryEvidence: {
        mode: "strict" as const,
        facts: [
          {
            kind: "backend_runtime" as const,
            value: "ecs_fargate_service",
            sourcePath: "package.json"
          }
        ]
      }
    }
  ];

  for (const authorityField of authorityFields) {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/architecture-draft/stream",
      payload: {
        prompt: "Repository 구조를 추천해 주세요.",
        ...authorityField
      }
    });

    assert.equal(response.statusCode, 400);
  }
  assert.equal(callCount, 0);
});

async function buildAiRouteApp(
  createArchitectureDraftResponse: CreateArchitectureDraftResponseFactory
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({ error: "bad_request", message: error.message });
      return;
    }

    void reply.send(error);
  });
  await app.register(registerAiRoutes, {
    prefix: "/api",
    createArchitectureDraftResponse
  });
  return app;
}

function parseNdjson(body: string): ArchitectureDraftStreamEvent[] {
  return body
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ArchitectureDraftStreamEvent);
}
