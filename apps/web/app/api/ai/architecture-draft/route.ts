import {
  forwardArchitectureDraftProxyRequest,
  type ArchitectureDraftProxyOptions
} from "./proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

type ArchitectureDraftRequestOptions = {
  readonly apiOrigin?: string | undefined;
  readonly fetcher?: typeof fetch | undefined;
};

export async function POST(request: Request): Promise<Response> {
  return forwardArchitectureDraftRequest(request);
}

export async function forwardArchitectureDraftRequest(
  request: Request,
  options: ArchitectureDraftRequestOptions = {}
): Promise<Response> {
  return forwardArchitectureDraftProxyRequest(request, {
    ...options,
    backendPath: "/api/ai/architecture-draft"
  } satisfies ArchitectureDraftProxyOptions);
}
