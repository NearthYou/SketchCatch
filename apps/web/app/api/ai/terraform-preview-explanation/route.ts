import {
  forwardArchitectureDraftProxyRequest,
  type ArchitectureDraftProxyOptions
} from "../architecture-draft/proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

type TerraformPreviewExplanationRequestOptions = {
  readonly apiOrigin?: string | undefined;
  readonly fetcher?: typeof fetch | undefined;
};

export async function POST(request: Request): Promise<Response> {
  return forwardTerraformPreviewExplanationRequest(request);
}

export async function forwardTerraformPreviewExplanationRequest(
  request: Request,
  options: TerraformPreviewExplanationRequestOptions = {}
): Promise<Response> {
  return forwardArchitectureDraftProxyRequest(request, {
    ...options,
    backendPath: "/api/ai/terraform-preview-explanation"
  } satisfies ArchitectureDraftProxyOptions);
}
