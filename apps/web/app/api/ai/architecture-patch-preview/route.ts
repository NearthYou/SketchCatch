import {
  forwardArchitectureDraftProxyRequest,
  type ArchitectureDraftProxyOptions
} from "../architecture-draft/proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

type ArchitecturePatchPreviewRequestOptions = {
  readonly apiOrigin?: string | undefined;
  readonly fetcher?: typeof fetch | undefined;
};

export async function POST(request: Request): Promise<Response> {
  return forwardArchitecturePatchPreviewRequest(request);
}

export async function forwardArchitecturePatchPreviewRequest(
  request: Request,
  options: ArchitecturePatchPreviewRequestOptions = {}
): Promise<Response> {
  return forwardArchitectureDraftProxyRequest(request, {
    ...options,
    backendPath: "/api/ai/architecture-patch-preview"
  } satisfies ArchitectureDraftProxyOptions);
}
