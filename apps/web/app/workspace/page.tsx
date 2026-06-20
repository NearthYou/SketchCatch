const sections = [
  "Prompt input area placeholder",
  "Architecture board placeholder",
  "Cost and risk panel placeholder",
  "Deployment session panel placeholder"
];

export default function WorkspacePage() {
  return (
    <main className="workspaceShell">
      <h1>Workspace</h1>
      <div className="workspaceGrid">
        {sections.map((section) => (
          <section className="workspacePanel" key={section}>
            <h2>{section}</h2>
          </section>
        ))}
      </div>
    </main>
  );
}
