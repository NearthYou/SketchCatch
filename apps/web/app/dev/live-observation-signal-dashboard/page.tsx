import { notFound } from "next/navigation";
import { LiveObservationSignalDashboard } from "../../../features/workspace/LiveObservationSignalDashboard";
import {
  getLiveObservationSignalDashboardFixture,
  LIVE_OBSERVATION_SIGNAL_DASHBOARD_FIXTURE_NAMES
} from "../../../features/workspace/live-observation-signal-dashboard-fixtures";

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
        <LiveObservationSignalDashboard
          deployment={null}
          snapshot={getLiveObservationSignalDashboardFixture(fixtureName)}
        />
      </div>
    </main>
  );
}

/** Reads one query value so accidental repeated state parameters cannot make browser QA nondeterministic. */
function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
