export function findAppendOnlyMigrationHistoryFailures(baseEntries, currentEntries) {
  if (baseEntries.length === 0) return [];

  const failures = [];
  const baseTags = new Set(baseEntries.map((entry) => entry.tag));
  const currentByTag = new Map(currentEntries.map((entry) => [entry.tag, entry]));
  const latestBaseTimestamp = Math.max(...baseEntries.map((entry) => entry.when));

  for (const baseEntry of baseEntries) {
    const currentEntry = currentByTag.get(baseEntry.tag);
    if (!currentEntry) {
      failures.push(`${baseEntry.tag} was removed from the migration journal`);
    } else if (currentEntry.when !== baseEntry.when) {
      failures.push(
        `${baseEntry.tag} changed timestamp from ${baseEntry.when} to ${currentEntry.when}`
      );
    }
  }

  failures.push(
    ...currentEntries
      .filter((entry) => !baseTags.has(entry.tag) && entry.when <= latestBaseTimestamp)
      .map(
        (entry) =>
          `${entry.tag} was inserted at ${entry.when}, not after deployed migration timestamp ${latestBaseTimestamp}`
      )
  );

  return failures;
}
