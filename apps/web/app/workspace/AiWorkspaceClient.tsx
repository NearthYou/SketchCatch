"use client";

import { useMemo, useState } from "react";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  TerraformGenerateResponse
} from "@sketchcatch/types";
import { apiFetch, getApiErrorMessage } from "../../lib/api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api";

const samplePrompt = "DB가 포함된 백엔드 API 서버를 AWS에 배포하고 싶어.";
const sampleTerraform = `resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
}

resource "aws_security_group_rule" "ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  cidr_blocks = ["0.0.0.0/0"]
}

resource "aws_db_instance" "main" {
  instance_class = "db.t3.micro"
}`;

const sampleDiagramJson: DiagramJson = {
  nodes: [
    makeSampleNode({
      id: "node-1",
      type: "aws_vpc",
      kind: "resource",
      label: "main_vpc",
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main",
        fileName: "main",
        values: {
          cidrBlock: "10.0.0.0/16",
          enableDnsSupport: true,
          enableDnsHostnames: true,
          tags: {
            Name: "main-vpc"
          }
        }
      }
    }),
    makeSampleNode({
      id: "node-2",
      type: "aws_subnet",
      kind: "resource",
      label: "public_subnet",
      parameters: {
        terraformBlockType: "resource",
        resourceType: "aws_subnet",
        resourceName: "public",
        fileName: "main",
        values: {
          vpcId: "aws_vpc.main.id",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          tags: {
            Name: "public-subnet"
          }
        }
      }
    })
  ],
  edges: [
    {
      id: "edge-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2"
    }
  ],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  }
};

function makeSampleNode(
  node: Omit<DiagramNode, "position" | "size" | "locked" | "zIndex"> &
    Partial<Pick<DiagramNode, "position" | "size" | "locked" | "zIndex">>
): DiagramNode {
  return {
    position: {
      x: 0,
      y: 0
    },
    size: {
      width: 160,
      height: 96
    },
    locked: false,
    zIndex: 0,
    ...node
  };
}

type RequestStatus = "idle" | "loading" | "error";

export function AiWorkspaceClient() {
  const [prompt, setPrompt] = useState(samplePrompt);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [terraformCode, setTerraformCode] = useState(sampleTerraform);
  const [draft, setDraft] = useState<AiArchitectureDraftResult | null>(null);
  const [analysis, setAnalysis] = useState<AiPreDeploymentAnalysisResult | null>(null);
  const [terraformPreview, setTerraformPreview] =
    useState<AiTerraformPreviewExplanationResult | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const architectureJson = useMemo<ArchitectureJson | null>(() => draft?.architectureJson ?? null, [draft]);

  async function runPromptDraft(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiArchitectureDraftResult>("/ai/architecture-draft", { prompt });
      setDraft(result);
      setAnalysis(null);
    });
  }

  async function runGitHubDraft(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiArchitectureDraftResult>("/ai/github-architecture-draft", {
        repositoryUrl
      });
      setDraft(result);
      setAnalysis(null);
    });
  }

  async function runPreDeploymentCheck(): Promise<void> {
    if (architectureJson === null) {
      setErrorMessage("먼저 Architecture Draft를 생성해야 사전 점검을 실행할 수 있습니다.");
      setStatus("error");
      return;
    }

    await runRequest(async () => {
      const result = await postJson<AiPreDeploymentAnalysisResult>("/ai/pre-deployment-check", {
        architectureJson
      });
      setAnalysis(result);
    });
  }

  async function runTerraformPreview(): Promise<void> {
    await runRequest(async () => {
      const result = await postJson<AiTerraformPreviewExplanationResult>(
        "/ai/terraform-preview-explanation",
        { terraformCode }
      );
      setTerraformPreview(result);
    });
  }

  async function runDiagramToTerraform(): Promise<void> {
    await runRequest(async () => {
      const result = await apiFetch<TerraformGenerateResponse>("/terraform/generate", {
        method: "POST",
        auth: true,
        body: {
          diagramJson: sampleDiagramJson
        }
      });

      setTerraformCode(result.terraformCode);
      setTerraformPreview(null);
    });
  }

  async function runRequest(request: () => Promise<void>): Promise<void> {
    setStatus("loading");
    setErrorMessage("");

    try {
      await request();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(getApiErrorMessage(error, "요청 처리 중 오류가 발생했습니다."));
    }
  }

  return (
    <div className="workspaceGrid workspaceGridWide">
      <section className="workspacePanel toolPanel">
        <h2>Architecture Draft</h2>
        <label className="fieldLabel" htmlFor="prompt-input">
          자연어 요청
        </label>
        <textarea
          className="textArea"
          id="prompt-input"
          onChange={(event) => setPrompt(event.target.value)}
          rows={5}
          value={prompt}
        />
        <button className="primaryButton" disabled={status === "loading"} onClick={runPromptDraft}>
          자연어 초안 생성
        </button>

        <label className="fieldLabel" htmlFor="github-url-input">
          GitHub public repository URL
        </label>
        <input
          className="textInput"
          id="github-url-input"
          onChange={(event) => setRepositoryUrl(event.target.value)}
          placeholder="https://github.com/owner/repo"
          type="url"
          value={repositoryUrl}
        />
        <button
          className="secondaryButton"
          disabled={status === "loading" || repositoryUrl.trim().length === 0}
          onClick={runGitHubDraft}
        >
          GitHub 초안 생성
        </button>
      </section>

      <section className="workspacePanel resultPanel">
        <h2>Draft 결과</h2>
        {draft === null ? (
          <p className="emptyState">초안을 만들면 보드가 열 수 있는 ArchitectureJson 요약이 표시됩니다.</p>
        ) : (
          <div className="resultStack">
            <p className="resultTitle">{draft.title}</p>
            <p className="mutedText">
              source: {draft.metadata.source} · confidence: {draft.metadata.confidence}
            </p>
            <div className="chipRow">
              {draft.architectureJson.nodes.map((node) => (
                <span className="resourceChip" key={node.id}>
                  {node.type} · {node.label ?? node.id}
                </span>
              ))}
            </div>
            <p className="mutedText">연결선 {draft.architectureJson.edges.length}개</p>
          </div>
        )}
        <button
          className="primaryButton"
          disabled={status === "loading" || architectureJson === null}
          onClick={runPreDeploymentCheck}
        >
          배포 전 점검
        </button>
      </section>

      <section className="workspacePanel resultPanel">
        <h2>비용/보안 점검</h2>
        {analysis === null ? (
          <p className="emptyState">Architecture Draft 생성 후 사전 점검을 실행하면 finding과 checklist가 나옵니다.</p>
        ) : (
          <ResultList
            items={analysis.findings.map((finding) => ({
              id: finding.id,
              label: `${finding.severity.toUpperCase()} · ${finding.title}`,
              text: finding.description
            }))}
            summary={analysis.summary}
          />
        )}
      </section>

      <section className="workspacePanel toolPanel">
        <h2>Terraform Preview 설명</h2>
        <label className="fieldLabel" htmlFor="terraform-input">
          Terraform 코드
        </label>
        <textarea
          className="codeArea"
          id="terraform-input"
          onChange={(event) => setTerraformCode(event.target.value)}
          rows={11}
          value={terraformCode}
        />
        <button
          className="secondaryButton"
          disabled={status === "loading"}
          onClick={runDiagramToTerraform}
        >
          샘플 다이어그램 변환
        </button>
        <button className="primaryButton" disabled={status === "loading"} onClick={runTerraformPreview}>
          코드 설명 생성
        </button>
        {terraformPreview === null ? null : (
          <ResultList
            items={terraformPreview.detectedResources.map((resource) => ({
              id: `${resource.terraformType}-${resource.label}`,
              label: resource.label,
              text: resource.explanation
            }))}
            summary={terraformPreview.summary}
          />
        )}
      </section>

      {status === "error" ? <p className="errorBanner">{errorMessage}</p> : null}
      {status === "loading" ? <p className="loadingBanner">AI fallback 응답을 생성하는 중입니다.</p> : null}
    </div>
  );
}

type ResultItem = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
};

function ResultList({ items, summary }: { readonly items: readonly ResultItem[]; readonly summary: string }) {
  return (
    <div className="resultStack">
      <p className="resultTitle">{summary}</p>
      <ul className="resultList">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function postJson<ResponseBody>(
  path: string,
  body: Record<string, unknown>
): Promise<ResponseBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  return response.json();
}
