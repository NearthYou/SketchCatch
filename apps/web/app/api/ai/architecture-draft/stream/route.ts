import { forwardArchitectureDraftProxyRequest } from "../proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return forwardArchitectureDraftProxyRequest(request, {
    backendPath: "/api/ai/architecture-draft/stream"
  });
}
