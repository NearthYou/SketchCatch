export type ProjectDraftServerSaveFlightRef<T> = {
  current: Promise<T> | null;
};

export type ProjectDraftServerSaveFlightOptions = {
  readonly shouldRunAgainAfterInFlight?: (() => boolean) | undefined;
};

export function runProjectDraftServerSaveFlight<T>(
  flightRef: ProjectDraftServerSaveFlightRef<T>,
  save: () => Promise<T>,
  options: ProjectDraftServerSaveFlightOptions = {}
): Promise<T> {
  if (flightRef.current) {
    if (options.shouldRunAgainAfterInFlight === undefined) {
      return flightRef.current;
    }

    return flightRef.current.then(
      (result) => {
        if (!options.shouldRunAgainAfterInFlight?.()) {
          return result;
        }

        return runProjectDraftServerSaveFlight(flightRef, save, options);
      },
      (error: unknown) => {
        if (!options.shouldRunAgainAfterInFlight?.()) {
          throw error;
        }

        return runProjectDraftServerSaveFlight(flightRef, save, options);
      }
    );
  }

  const savePromise = save().finally(() => {
    if (flightRef.current === savePromise) {
      flightRef.current = null;
    }
  });

  flightRef.current = savePromise;
  return savePromise;
}
