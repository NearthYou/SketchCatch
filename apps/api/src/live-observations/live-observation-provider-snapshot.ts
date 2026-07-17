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
    const requiredCapacityValues = [
      snapshot.capacity.desired,
      snapshot.capacity.running,
      snapshot.capacity.healthy
    ];
    const requiredQuantitativeValues = [
      snapshot.requests,
      snapshot.errorRate,
      snapshot.p95LatencyMs,
      snapshot.availability,
      ...requiredCapacityValues
    ];
    const hasCompleteQuantitativeEvidence = requiredQuantitativeValues.every(
      (value) => value !== null
    );
    const hasAnyQuantitativeEvidence =
      requiredQuantitativeValues.some((value) => value !== null) ||
      snapshot.capacity.max !== null;
    if (
      snapshot.state === "available" &&
      (!hasCompleteQuantitativeEvidence || snapshot.observedAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Available snapshots require complete provider evidence"
      });
    }

    if (
      snapshot.state === "delayed" &&
      hasAnyQuantitativeEvidence &&
      (!hasCompleteQuantitativeEvidence || snapshot.observedAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Delayed snapshots require complete last-known provider evidence"
      });
    }

    if (snapshot.state === "unavailable" && hasAnyQuantitativeEvidence) {
      context.addIssue({
        code: "custom",
        message: "Unavailable snapshots must not retain quantitative evidence"
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
