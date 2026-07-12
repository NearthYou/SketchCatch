const DEFAULT_API_PROXY_ORIGIN = (
  process.env.API_PROXY_TARGET ??
  process.env.SKETCHCATCH_API_PROXY_ORIGIN ??
  "http://localhost:4000"
).replace(/\/+$/, "");
const ARCHITECTURE_DRAFT_PROXY_TIMEOUT_MS = 115_000;

export type ArchitectureDraftProxyOptions = {
  readonly apiOrigin?: string | undefined;
  readonly backendPath: string;
  readonly fetcher?: typeof fetch | undefined;
};

export async function forwardArchitectureDraftProxyRequest(
  request: Request,
  options: ArchitectureDraftProxyOptions
): Promise<Response> {
  const apiOrigin = (options.apiOrigin ?? DEFAULT_API_PROXY_ORIGIN).replace(/\/+$/, "");
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(`${apiOrigin}${options.backendPath}`, {
      body: await request.text(),
      cache: "no-store",
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
        "content-type": request.headers.get("content-type") ?? "application/json"
      },
      method: "POST",
      signal: AbortSignal.timeout(ARCHITECTURE_DRAFT_PROXY_TIMEOUT_MS)
    });
    const headers = new Headers();
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("content-type", response.headers.get("content-type") ?? "application/json");

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        error: "service_unavailable",
        message: timedOut
          ? "Amazon Q 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
          : "Amazon Q API 연결에 실패했습니다. 잠시 후 다시 시도해주세요."
      },
      { status: 503 }
    );
  }
}
