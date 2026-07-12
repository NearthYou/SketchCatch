export type ProjectDraftServerSaveFlightRef<T> = {
  current: Promise<T> | null;
};

export function runProjectDraftServerSaveFlight<T>(
  flightRef: ProjectDraftServerSaveFlightRef<T>,
  save: () => Promise<T>
): Promise<T> {
  if (flightRef.current) {
    return flightRef.current;
  }

  const savePromise = save().finally(() => {
    if (flightRef.current === savePromise) {
      flightRef.current = null;
    }
  });

  flightRef.current = savePromise;
  return savePromise;
}
