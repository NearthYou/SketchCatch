"""Recompute archived GitHub Actions measurements without external calls."""

from datetime import datetime
from pathlib import Path
import json
import statistics


def duration(start: str, end: str) -> float:
    return (datetime.fromisoformat(end.replace("Z", "+00:00")) -
            datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()


def verify(data: dict) -> None:
    baseline = data["baseline"]
    runs = baseline["runs"]
    if len(runs) != baseline["sampleCount"] or len(runs) != 4:
        raise ValueError("Baseline sample count mismatch")
    for run in runs + [data["warmCacheDeployment"], data["cachePreparation"]]:
        if run["conclusion"] != "success":
            raise ValueError("An archived measurement did not succeed")
        if duration(run["createdAt"], run["updatedAt"]) != run["elapsedSeconds"]:
            raise ValueError("Run duration mismatch")
    median = statistics.median(run["elapsedSeconds"] for run in runs)
    warm = data["warmCacheDeployment"]
    preparation = data["cachePreparation"]
    if warm["headSha"] != preparation["headSha"]:
        raise ValueError("Cache preparation and warm deployment must use the same commit")
    if any(job["conclusion"] != "skipped" for job in preparation["jobs"]
           if job["name"] in ("deploy-api", "deploy-web", "register-worker")):
        raise ValueError("Cache preparation unexpectedly deployed a service")
    expected = {
        "baselineMedianSeconds": median,
        "warmCacheRunSeconds": warm["elapsedSeconds"],
        "observedReductionPercent": round((median - warm["elapsedSeconds"]) / median * 100, 1),
    }
    if baseline["medianElapsedSeconds"] != median:
        raise ValueError("Baseline median mismatch")
    for key, value in expected.items():
        if data["comparison"][key] != value:
            raise ValueError(f"Comparison mismatch: {key}")
    before_steps = [duration(step["startedAt"], step["completedAt"])
                    for run in runs for job in run["jobs"] for step in job["steps"]]
    after_steps = [duration(step["startedAt"], step["completedAt"])
                   for job in warm["jobs"] for step in job["steps"]]
    if statistics.median(before_steps) != 81 or max(after_steps) != 7:
        raise ValueError("Image build critical path mismatch")


if __name__ == "__main__":
    data = json.loads((Path(__file__).parent / "deployment-build-results.json").read_text(encoding="utf-8"))
    verify(data)
    print("Deployment records verified: 4 baseline runs, 1 cache preparation, 1 warm deployment.")
