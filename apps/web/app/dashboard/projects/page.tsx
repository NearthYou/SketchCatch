import { DesignDashboardPage } from "../../../features/dashboard/design-dashboard";
import { DesignProjectsView } from "../../../features/projects/design-projects-view";

export default function ProjectsPage() {
  return (
    <DesignDashboardPage view="projects">
      <DesignProjectsView />
    </DesignDashboardPage>
  );
}
