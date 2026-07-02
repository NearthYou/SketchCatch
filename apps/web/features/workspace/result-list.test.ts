import assert from "node:assert/strict";
import { test } from "node:test";
import { createResultGroups } from "../../app/workspace/ResultList";

test("createResultGroups groups repeated result labels under one section", () => {
  assert.deepEqual(
    createResultGroups([
      { id: "cost-0", label: "비용 압박", text: "RDS 비용 확인" },
      { id: "cost-1", label: "비용 압박", text: "EC2 실행 시간 확인" },
      { id: "recommendation-0", label: "추천 검토", text: "백업 계획 확인" }
    ]),
    [
      {
        id: "cost-0",
        label: "비용 압박",
        items: [
          { id: "cost-0", label: "비용 압박", text: "RDS 비용 확인" },
          { id: "cost-1", label: "비용 압박", text: "EC2 실행 시간 확인" }
        ]
      },
      {
        id: "recommendation-0",
        label: "추천 검토",
        items: [{ id: "recommendation-0", label: "추천 검토", text: "백업 계획 확인" }]
      }
    ]
  );
});
