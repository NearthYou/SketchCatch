import type { LiveObservationProviderSnapshot } from "@sketchcatch/types";
import { z } from "zod";

const nullableNonNegativeNumber = z.number().finite().nonnegative().nullable();
const nullablePercent = z.number().finite().min(0).max(100).nullable();
const canonicalTimestamp = z.iso.datetime({ offset: true });

export const liveObservationProviderSnapshotSchema: z.ZodType<LiveObservationProviderSnapshot> = z
  .object({
    requests: nullableNonNegativeNumber,
    errorRate: nullablePercent,
    p95LatencyMs: nullableNonNegativeNumber,
    availability: nullablePercent,
    capacity: z
      .object({
        desired: nullableNonNegativeNumber,
        running: nullableNonNegativeNumber,
        healthy: nullableNonNegativeNumber,
        max: nullableNonNegativeNumber
      })
      .strict(),
    logs: z
      .array(
        z
          .object({
            timestamp: canonicalTimestamp,
            message: z.string().min(1).max(4_096)
          })
          .strict()
      )
      .max(50),
    observedAt: canonicalTimestamp.nullable(),
    state: z.enum(["available", "delayed", "unavailable"])
  })
  .strict()
  .superRefine((snapshot, context) => {
    const capacityValues = [
      snapshot.capacity.desired,
      snapshot.capacity.running,
      snapshot.capacity.healthy,
      snapshot.capacity.max
    ];
    if (
      snapshot.state === "available" &&
      (snapshot.requests === null ||
        snapshot.errorRate === null ||
        snapshot.p95LatencyMs === null ||
        snapshot.availability === null ||
        snapshot.observedAt === null ||
        capacityValues.some((value) => value === null))
    ) {
      context.addIssue({
        code: "custom",
        message: "Available snapshots require complete provider evidence"
      });
    }

    if (
      snapshot.state !== "available" &&
      (snapshot.requests !== null ||
        snapshot.errorRate !== null ||
        snapshot.p95LatencyMs !== null ||
        snapshot.availability !== null ||
        capacityValues.some((value) => value !== null))
    ) {
      context.addIssue({
        code: "custom",
        message: "Delayed or unavailable snapshots must not retain quantitative evidence"
      });
    }

    const { desired, running, healthy, max } = snapshot.capacity;
    if (healthy !== null && running !== null && healthy > running) {
      context.addIssue({ code: "custom", path: ["capacity", "healthy"], message: "Healthy capacity exceeds running capacity" });
    }
    if (
      max !== null &&
      ((desired !== null && desired > max) || (running !== null && running > max))
    ) {
      context.addIssue({ code: "custom", path: ["capacity", "max"], message: "Capacity exceeds maximum" });
    }
  });

export function parseLiveObservationProviderSnapshot(
  value: unknown
): LiveObservationProviderSnapshot {
  return liveObservationProviderSnapshotSchema.parse(value);
}
