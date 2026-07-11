import type {
  CollectLiveObservationEventResponse,
  CreateLiveObservationResponse,
  LiveObservationSnapshotResponse,
  StopLiveObservationResponse
} from "./index.js";

export type LiveObservationContract = {
  collect: CollectLiveObservationEventResponse;
  create: CreateLiveObservationResponse;
  snapshot: LiveObservationSnapshotResponse;
  stop: StopLiveObservationResponse;
};
