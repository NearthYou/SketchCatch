const LOCAL_ORIGIN = "https://sketchcatch.local";

export function getSafeCicdReturnPath(input: {
  readonly rawReturnTo: string | null | undefined;
  readonly projectId: string;
}): string | null {
  const { rawReturnTo, projectId } = input;

  if (!rawReturnTo?.startsWith("/") || rawReturnTo.startsWith("//")) {
    return null;
  }

  try {
    const destination = new URL(rawReturnTo, LOCAL_ORIGIN);
    const destinationProjectIds = destination.searchParams.getAll("projectId");

    if (
      destination.origin !== LOCAL_ORIGIN ||
      destination.pathname !== "/workspace" ||
      destinationProjectIds.length !== 1 ||
      destinationProjectIds[0] !== projectId
    ) {
      return null;
    }

    return `${destination.pathname}${destination.search}`;
  } catch {
    return null;
  }
}
