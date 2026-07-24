import { notFound } from "next/navigation";
import type { ArchitectureJson } from "@sketchcatch/types";
import { LiveObservationFocusedFlow } from "../../../features/workspace/LiveObservationFocusedFlow";
import { LiveObservationSignalDashboard } from "../../../features/workspace/LiveObservationSignalDashboard";
import {
  getLiveObservationSignalDashboardFixture,
  LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES
} from "../../../features/workspace/live-observation-signal-dashboard-fixtures";

const LIVE_OBSERVATION_ARCHITECTURE_FIXTURE = {
  nodes: [
    resourceNode("cloudfront", "CLOUDFRONT", "CloudFront", 0),
    resourceNode("alb", "LOAD_BALANCER", "ALB", 200),
    resourceNode("target", "LOAD_BALANCER_TARGET_GROUP", "Target Group", 400),
    resourceNode("task", "ECS_TASK_DEFINITION", "Fargate Task", 600),
    resourceNode("service", "ECS_SERVICE", "ECS Service", 800),
    {
      ...resourceNode("scaling-target", "APPLICATION_AUTO_SCALING_TARGET", "Auto Scaling", 1000),
      config: { maxCapacity: 6, minCapacity: 2 }
    },
    {
      ...resourceNode("scaling-policy", "APPLICATION_AUTO_SCALING_POLICY", "Scaling Policy", 1200),
      config: {
        policyType: "TargetTrackingScaling",
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ALBRequestCountPerTarget"
          },
          targetValue: 5
        }
      }
    }
  ],
  edges: [
    { id: "cloudfront-alb", sourceId: "cloudfront", targetId: "alb", label: "routes" },
    { id: "alb-target", sourceId: "alb", targetId: "target", label: "forwards" },
    { id: "target-service", sourceId: "target", targetId: "service", label: "targets" },
    { id: "service-task", sourceId: "service", targetId: "task", label: "uses" },
    { id: "service-scaling", sourceId: "service", targetId: "scaling-target", label: "scales" },
    { id: "scaling-policy", sourceId: "scaling-target", targetId: "scaling-policy", label: "uses" }
  ]
} satisfies ArchitectureJson;

type LiveObservationSignalDashboardFixturePageProps = {
  readonly searchParams?: Promise<{ readonly state?: string | string[] | undefined }>;
};

/** Provides an unreachable-in-production page for checking real dashboard rendering against explicit local fixture states. */
export default async function LiveObservationSignalDashboardFixturePage({
  searchParams
}: LiveObservationSignalDashboardFixturePageProps) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const fixtureName = getSingleSearchParam(params?.state) ?? "failure";
  if (
    !LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES.includes(
      fixtureName as (typeof LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES)[number]
    )
  ) {
    notFound();
  }
  const snapshot = getLiveObservationSignalDashboardFixture(fixtureName);

  return (
    <main style={{ background: "#fafafa", minHeight: "100vh", padding: "32px" }}>
      <div style={{ margin: "0 auto", maxWidth: "1120px" }}>
        <p
          style={{
            color: "#6b7280",
            fontSize: "calc(13px + var(--presentation-font-size-increase))",
            margin: "0 0 8px"
          }}
        >
          개발용 Live Observation fixture
        </p>
        <LiveObservationFocusedFlow
          architecture={LIVE_OBSERVATION_ARCHITECTURE_FIXTURE}
          snapshot={snapshot}
        />
        <LiveObservationSignalDashboard
          architecture={LIVE_OBSERVATION_ARCHITECTURE_FIXTURE}
          deployment={null}
          snapshot={snapshot}
        />
      </div>
    </main>
  );
}

function resourceNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number
): ArchitectureJson["nodes"][number] {
  return { config: {}, id, label, positionX, positionY: 0, type };
}

/** Reads one query value so accidental repeated state parameters cannot make browser QA nondeterministic. */
function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}