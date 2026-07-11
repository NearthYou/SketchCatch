const DEFAULT_RETURN_PATH = "/dashboard";
const LOCAL_ORIGIN = "https://sketchcatch.local";

// 로그인 query에 담긴 내부 route만 허용해 외부 사이트로 빠지는 redirect를 막는다.
export function getSafeReturnPath(returnTo: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const destination = new URL(returnTo, LOCAL_ORIGIN);

    if (destination.origin !== LOCAL_ORIGIN) {
      return DEFAULT_RETURN_PATH;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}
