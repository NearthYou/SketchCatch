import type {
  DeploymentLiveObservationManifestV2,
  IsoDateTimeString,
  JsonValue
} from "@sketchcatch/types";

export const LIVE_OBSERVATION_STORE_POLICY = Object.freeze({
  sessionLifetimeMs: 15 * 60 * 1_000,
  terminalTombstoneRetentionMs: 60 * 1_000,
  rollingWindowSeconds: 10,
  maxWeightedBurstPerSecond: 20,
  maxAcceptedEventsPerRateWindow: 100,
  maxAcceptedEventsPerSession: 5_000,
  observerLeaseDurationMs: 15 * 1_000,
  presenterBoostLeaseDurationMs: 10 * 1_000
} as const);

export type LiveObservationStoreCreateInput = {
  observationId: string;
  manifest: DeploymentLiveObservationManifestV2;
  capability: {
    kid: string;
    tokenVersion: number;
  };
};

export type LiveObservationStoreLiveView = {
  acceptedEventCount: number;
  rollingRequestsPerSecond: number;
  projectedRequestsPerMinute: number;
  pressurePercent: number;
  pressureLevel: "normal" | "warning" | "high" | "critical";
  observedAt: IsoDateTimeString;
};

export type LiveObservationStoreObservation = {
  observedAt: IsoDateTimeString;
  payload: JsonValue;
};

export type LiveObservationStoreActiveSession = {
  observationId: string;
  deploymentId: string;
  status: "active";
  manifest: DeploymentLiveObservationManifestV2;
  capability: {
    kid: string;
    tokenVersion: number;
  };
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
  live: LiveObservationStoreLiveView;
  latestObservation: LiveObservationStoreObservation | null;
};

export type LiveObservationStoreTerminalSession = {
  observationId: string;
  deploymentId: string;
  status: "stopped" | "expired";
  createdAt: IsoDateTimeString;
  expiresAt: IsoDateTimeString;
  terminalAt: IsoDateTimeString;
  finalLive: LiveObservationStoreLiveView;
  finalObservation: LiveObservationStoreObservation | null;
};

export type LiveObservationStoreCreateResult =
  | {
      kind: "created";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreActiveSession;
    }
  | {
      kind: "active_exists";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreActiveSession;
    }
  | {
      kind: "observation_id_conflict";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStoreReadResult =
  | {
      kind: "active";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreActiveSession;
    }
  | {
      kind: "terminal";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStoreCollectResult =
  | {
      kind: "accepted";
      evaluatedAt: IsoDateTimeString;
      live: LiveObservationStoreLiveView;
    }
  | {
      kind: "duplicate";
      evaluatedAt: IsoDateTimeString;
      live: LiveObservationStoreLiveView;
    }
  | {
      kind: "rate_limited";
      evaluatedAt: IsoDateTimeString;
      live: LiveObservationStoreLiveView;
    }
  | {
      kind: "event_limit_reached";
      evaluatedAt: IsoDateTimeString;
      live: LiveObservationStoreLiveView;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStoreStopResult =
  | {
      kind: "stopped";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "already_terminal";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStoreObserverLease = {
  fencingToken: number;
  expiresAt: IsoDateTimeString;
};

export type LiveObservationStoreObserverLeaseClaimResult =
  | {
      kind: "claimed";
      evaluatedAt: IsoDateTimeString;
      lease: LiveObservationStoreObserverLease;
    }
  | {
      kind: "contended";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStoreObservationCommitResult =
  | {
      kind: "committed";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "lease_lost";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "stale_observation";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStorePresenterBoostLease = {
  leaseId: string;
  expiresAt: IsoDateTimeString;
};

export type LiveObservationStorePresenterBoostAcquireResult =
  | {
      kind: "acquired";
      evaluatedAt: IsoDateTimeString;
      lease: LiveObservationStorePresenterBoostLease;
    }
  | {
      kind: "already_acquired";
      evaluatedAt: IsoDateTimeString;
      lease: LiveObservationStorePresenterBoostLease;
    }
  | {
      kind: "busy";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStorePresenterBoostRenewResult =
  | {
      kind: "renewed";
      evaluatedAt: IsoDateTimeString;
      lease: LiveObservationStorePresenterBoostLease;
    }
  | {
      kind: "lease_lost";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStorePresenterBoostReleaseResult =
  | {
      kind: "released";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "lease_lost";
      evaluatedAt: IsoDateTimeString;
    }
  | {
      kind: "gone";
      evaluatedAt: IsoDateTimeString;
      session: LiveObservationStoreTerminalSession;
    }
  | {
      kind: "not_found";
      evaluatedAt: IsoDateTimeString;
    };

export type LiveObservationStore = {
  createSession(
    input: LiveObservationStoreCreateInput
  ): Promise<LiveObservationStoreCreateResult>;
  readSession(input: {
    observationId: string;
  }): Promise<LiveObservationStoreReadResult>;
  collectEvent(input: {
    observationId: string;
    eventId: string;
  }): Promise<LiveObservationStoreCollectResult>;
  stopSession(input: {
    observationId: string;
    deploymentId: string;
  }): Promise<LiveObservationStoreStopResult>;
  claimObserverLease(input: {
    observationId: string;
    observerId: string;
  }): Promise<LiveObservationStoreObserverLeaseClaimResult>;
  commitObservation(input: {
    observationId: string;
    observerId: string;
    fencingToken: number;
    observation: LiveObservationStoreObservation;
  }): Promise<LiveObservationStoreObservationCommitResult>;
  acquirePresenterBoostLease(input: {
    observationId: string;
    leaseId: string;
  }): Promise<LiveObservationStorePresenterBoostAcquireResult>;
  renewPresenterBoostLease(input: {
    observationId: string;
    leaseId: string;
  }): Promise<LiveObservationStorePresenterBoostRenewResult>;
  releasePresenterBoostLease(input: {
    observationId: string;
    leaseId: string;
  }): Promise<LiveObservationStorePresenterBoostReleaseResult>;
};

export class LiveObservationStoreInputError extends Error {
  constructor() {
    super("Invalid Live Observation Store input");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationStoreInputError"
    });
  }
}

export class LiveObservationStoreClockError extends Error {
  constructor() {
    super("Invalid Live Observation Store clock");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationStoreClockError"
    });
  }
}

export class LiveObservationStoreUnavailableError extends Error {
  constructor() {
    super("Live Observation Store unavailable");
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "LiveObservationStoreUnavailableError"
    });
  }
}
