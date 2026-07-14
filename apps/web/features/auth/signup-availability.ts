export type AvailabilityStatus = "idle" | "checking" | "available" | "duplicate" | "error";

export type AvailabilityState = {
  readonly message: string | null;
  readonly status: AvailabilityStatus;
  readonly value: string | null;
};

export const INITIAL_AVAILABILITY_STATE: AvailabilityState = {
  message: null,
  status: "idle",
  value: null
};

export function createAvailabilityRequestCoordinator() {
  let activeController: AbortController | null = null;
  let requestSequence = 0;

  return {
    cancel(): void {
      requestSequence += 1;
      activeController?.abort();
      activeController = null;
    },
    async run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
      const sequence = ++requestSequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const result = await request(controller.signal);
        return sequence === requestSequence ? result : null;
      } catch (error) {
        if (controller.signal.aborted || sequence !== requestSequence) return null;
        throw error;
      } finally {
        if (sequence === requestSequence) activeController = null;
      }
    }
  };
}

export async function runAvailabilityCheck({
  availableMessage,
  checkingMessage,
  coordinator,
  duplicateMessage,
  emptyMessage,
  errorMessage,
  isValid,
  invalidMessage,
  normalizedValue,
  onStateChange,
  request
}: {
  readonly availableMessage: string;
  readonly checkingMessage: string;
  readonly coordinator: ReturnType<typeof createAvailabilityRequestCoordinator>;
  readonly duplicateMessage: string;
  readonly emptyMessage: string;
  readonly errorMessage: (error: unknown) => string;
  readonly isValid: (value: string) => boolean;
  readonly invalidMessage: string;
  readonly normalizedValue: string;
  readonly onStateChange: (state: AvailabilityState) => void;
  readonly request: (signal: AbortSignal) => Promise<boolean>;
}): Promise<void> {
  if (!normalizedValue) {
    onStateChange({ message: emptyMessage, status: "error", value: null });
    return;
  }
  if (!isValid(normalizedValue)) {
    onStateChange({ message: invalidMessage, status: "error", value: normalizedValue });
    return;
  }

  onStateChange({ message: checkingMessage, status: "checking", value: normalizedValue });
  try {
    const isAvailable = await coordinator.run(request);
    if (isAvailable === null) return;
    onStateChange({
      message: isAvailable ? availableMessage : duplicateMessage,
      status: isAvailable ? "available" : "duplicate",
      value: normalizedValue
    });
  } catch (error) {
    onStateChange({ message: errorMessage(error), status: "error", value: normalizedValue });
  }
}
