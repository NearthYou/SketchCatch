import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES,
  LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX,
  LIVE_OBSERVATION_SIGNAL_NODES,
  LIVE_OBSERVATION_SIGNAL_VIEWBOX,
  getLiveObservationMobilePulsePath,
  getLiveObservationMobileStaticRailPaths,
  getLiveObservationPulsePath,
  getLiveObservationStaticRailPaths,
  type LiveObservationMobileSignalLane,
  type LiveObservationSignalLane,
  type LiveObservationSignalNodeRect
} from "./live-observation-signal-geometry";

const RAIL_CLEARANCE = 10;
const MOBILE_RAIL_CLEARANCE = 2;

const mobileNodes = LIVE_OBSERVATION_MOBILE_SIGNAL_NODES;

function getExpectedOutsidePerimeterPath(
  node: LiveObservationSignalNodeRect,
  lane: LiveObservationSignalLane
): string {
  const entryX = node.x - RAIL_CLEARANCE;
  const exitX = node.x + node.width + RAIL_CLEARANCE;
  const laneY = lane === "upper"
    ? node.y + node.radius
    : node.y + node.height - node.radius;
  const offsetRadius = node.radius + RAIL_CLEARANCE;
  const leftTangentX = node.x + node.radius;
  const rightTangentX = node.x + node.width - node.radius;

  return lane === "upper"
    ? `M ${entryX} ${laneY} A ${offsetRadius} ${offsetRadius} 0 0 1 ${leftTangentX} ${node.y - RAIL_CLEARANCE} L ${rightTangentX} ${node.y - RAIL_CLEARANCE} A ${offsetRadius} ${offsetRadius} 0 0 1 ${exitX} ${laneY}`
    : `M ${entryX} ${laneY} A ${offsetRadius} ${offsetRadius} 0 0 0 ${leftTangentX} ${node.y + node.height + RAIL_CLEARANCE} L ${rightTangentX} ${node.y + node.height + RAIL_CLEARANCE} A ${offsetRadius} ${offsetRadius} 0 0 0 ${exitX} ${laneY}`;
}

function getExpectedMobileOutsidePerimeterPath(
  node: LiveObservationSignalNodeRect,
  lane: LiveObservationMobileSignalLane
): string {
  const entryY = node.y - MOBILE_RAIL_CLEARANCE;
  const exitY = node.y + node.height + MOBILE_RAIL_CLEARANCE;
  const laneX = lane === "left"
    ? node.x + node.radius
    : node.x + node.width - node.radius;
  const offsetRadius = node.radius + MOBILE_RAIL_CLEARANCE;
  const topTangentY = node.y + node.radius;
  const bottomTangentY = node.y + node.height - node.radius;

  return lane === "left"
    ? `M ${laneX} ${entryY} A ${offsetRadius} ${offsetRadius} 0 0 0 ${node.x - MOBILE_RAIL_CLEARANCE} ${topTangentY} L ${node.x - MOBILE_RAIL_CLEARANCE} ${bottomTangentY} A ${offsetRadius} ${offsetRadius} 0 0 0 ${laneX} ${exitY}`
    : `M ${laneX} ${entryY} A ${offsetRadius} ${offsetRadius} 0 0 1 ${node.x + node.width + MOBILE_RAIL_CLEARANCE} ${topTangentY} L ${node.x + node.width + MOBILE_RAIL_CLEARANCE} ${bottomTangentY} A ${offsetRadius} ${offsetRadius} 0 0 1 ${laneX} ${exitY}`;
}

function stripInitialMove(path: string): string {
  return path.replace(/^M -?\d+(?:\.\d+)? -?\d+(?:\.\d+)? /, "");
}

test("desktop rail model uses the approved viewBox and immutable node rectangles", () => {
  assert.equal(LIVE_OBSERVATION_SIGNAL_VIEWBOX, "0 0 1600 640");
  assert.equal(Object.isFrozen(LIVE_OBSERVATION_SIGNAL_NODES), true);
  for (const node of Object.values(LIVE_OBSERVATION_SIGNAL_NODES)) {
    assert.equal(Object.isFrozen(node), true);
  }
});

test("mobile rail model exposes an immutable vertical viewBox and node geometry", () => {
  assert.equal(LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX, "0 0 100 180");
  assert.deepEqual(Object.keys(mobileNodes), [
    "audience",
    "s3",
    "alb",
    "asg",
    "ec2Single",
    "ec2Left",
    "ec2Right"
  ]);
  assert.equal(Object.isFrozen(mobileNodes), true);
  for (const node of Object.values(mobileNodes)) {
    assert.equal(Object.isFrozen(node), true);
  }
});

test("mobile left and right perimeter rails stay 2 units outside every active node", () => {
  const perimeterPaths = getLiveObservationMobileStaticRailPaths(2)
    .filter((rail) => rail.kind === "perimeter")
    .map((rail) => rail.d);
  const activeNodes = [
    mobileNodes.audience,
    mobileNodes.s3,
    mobileNodes.alb,
    mobileNodes.asg,
    mobileNodes.ec2Left,
    mobileNodes.ec2Right
  ];

  assert.equal(activeNodes.every(Boolean), true);
  assert.deepEqual(
    perimeterPaths,
    activeNodes.flatMap((node) => [
      getExpectedMobileOutsidePerimeterPath(node!, "left"),
      getExpectedMobileOutsidePerimeterPath(node!, "right")
    ])
  );
  assert.deepEqual(
    getLiveObservationMobileStaticRailPaths(2)
      .filter((rail) => rail.kind === "perimeter")
      .map((rail) => [rail.nodeId, rail.lane]),
    ["audience", "s3", "alb", "asg", "ec2-0", "ec2-1"].flatMap(
      (nodeId) => [[nodeId, "left"], [nodeId, "right"]]
    )
  );
});

test("mobile vertical geometry has exact 0, 1, and 2 EC2 connectivity", () => {
  for (const slotCount of [0, 1, 2] as const) {
    const rails = getLiveObservationMobileStaticRailPaths(slotCount);
    assert.equal(
      rails.filter((rail) => rail.kind === "connector").length,
      6
    );
    assert.deepEqual(
      rails
        .filter((rail) => rail.kind === "ec2-branch")
        .map((rail) => rail.targetIndex),
      Array.from({ length: slotCount }, (_, index) => [index, index]).flat()
    );
    assert.equal(rails.length, 14 + slotCount * 4);
  }

  assert.deepEqual(
    getLiveObservationMobileStaticRailPaths(1).filter(
      (rail) => rail.kind === "ec2-branch"
    ),
    [
      {
        d: "M 25 128 C 25 137 35 137 35 146",
        kind: "ec2-branch",
        lane: "left",
        nodeId: "ec2-0",
        targetIndex: 0
      },
      {
        d: "M 75 128 C 75 137 65 137 65 146",
        kind: "ec2-branch",
        lane: "right",
        nodeId: "ec2-0",
        targetIndex: 0
      }
    ]
  );
});

test("mobile connectors preserve separate left and right coordinates", () => {
  assert.deepEqual(
    getLiveObservationMobileStaticRailPaths(2)
      .filter((rail) => rail.kind === "connector")
      .map((rail) => [rail.lane, rail.d]),
    [
      ["left", "M 25 32 L 25 40"],
      ["right", "M 75 32 L 75 40"],
      ["left", "M 25 64 L 25 72"],
      ["right", "M 75 64 L 75 72"],
      ["left", "M 25 96 L 25 104"],
      ["right", "M 75 96 L 75 104"]
    ]
  );
});

test("mobile pulse paths reuse the same left and right perimeter builders", () => {
  const staticRails = getLiveObservationMobileStaticRailPaths(2);
  const cases = [
    {
      lane: "left" as const,
      nodes: [
        mobileNodes.audience,
        mobileNodes.s3,
        mobileNodes.alb,
        mobileNodes.asg,
        mobileNodes.ec2Left
      ],
      targetIndex: 0
    },
    {
      lane: "right" as const,
      nodes: [
        mobileNodes.audience,
        mobileNodes.s3,
        mobileNodes.alb,
        mobileNodes.asg,
        mobileNodes.ec2Right
      ],
      targetIndex: 1
    }
  ];

  for (const { lane, nodes, targetIndex } of cases) {
    const pulsePath = getLiveObservationMobilePulsePath({
      lane,
      slotCount: 2,
      targetIndex
    });
    for (const [index, node] of nodes.entries()) {
      assert.ok(node);
      const expectedPath = getExpectedMobileOutsidePerimeterPath(node!, lane);
      const staticPath = staticRails.find(
        (rail) => rail.kind === "perimeter" && rail.d === expectedPath
      );
      assert.ok(staticPath);
      assert.equal(
        pulsePath.includes(index === 0 ? staticPath.d : stripInitialMove(staticPath.d)),
        true
      );
    }
  }
});

test("desktop perimeter rails stay exactly 10px outside every active node rectangle", () => {
  const perimeterPaths = getLiveObservationStaticRailPaths(2)
    .filter((rail) => rail.kind === "perimeter")
    .map((rail) => rail.d);
  const activeNodes = [
    LIVE_OBSERVATION_SIGNAL_NODES.audience,
    LIVE_OBSERVATION_SIGNAL_NODES.s3,
    LIVE_OBSERVATION_SIGNAL_NODES.alb,
    LIVE_OBSERVATION_SIGNAL_NODES.asg,
    LIVE_OBSERVATION_SIGNAL_NODES.ec2Upper,
    LIVE_OBSERVATION_SIGNAL_NODES.ec2Lower
  ];

  assert.deepEqual(
    perimeterPaths,
    activeNodes.flatMap((node) => [
      getExpectedOutsidePerimeterPath(node, "upper"),
      getExpectedOutsidePerimeterPath(node, "lower")
    ])
  );
  assert.deepEqual(
    getLiveObservationStaticRailPaths(2)
      .filter((rail) => rail.kind === "perimeter")
      .map((rail) => [rail.nodeId, rail.lane]),
    ["audience", "s3", "alb", "asg", "ec2-0", "ec2-1"].flatMap(
      (nodeId) => [[nodeId, "upper"], [nodeId, "lower"]]
    )
  );
});

test("desktop connectors and EC2 branches preserve separate upper and lower coordinates", () => {
  const rails = getLiveObservationStaticRailPaths(2);
  assert.deepEqual(
    rails
      .filter((rail) => rail.kind === "connector")
      .map((rail) => [rail.lane, rail.d]),
    [
      ["upper", "M 270 278 L 350 278"],
      ["lower", "M 270 362 L 350 362"],
      ["upper", "M 560 278 L 640 278"],
      ["lower", "M 560 362 L 640 362"],
      ["upper", "M 850 278 L 930 278"],
      ["lower", "M 850 362 L 930 362"]
    ]
  );
  assert.deepEqual(
    rails
      .filter((rail) => rail.kind === "ec2-branch")
      .map((rail) => [rail.targetIndex, rail.lane, rail.d]),
    [
      [0, "upper", "M 1160 278 C 1235 278 1235 128 1310 128"],
      [0, "lower", "M 1160 362 C 1235 362 1235 212 1310 212"],
      [1, "upper", "M 1160 278 C 1235 278 1235 428 1310 428"],
      [1, "lower", "M 1160 362 C 1235 362 1235 512 1310 512"]
    ]
  );
});

test("desktop rail model creates exactly two branches for each supported EC2 slot", () => {
  for (const slotCount of [0, 1, 2] as const) {
    assert.equal(
      getLiveObservationStaticRailPaths(slotCount).filter(
        (rail) => rail.kind === "ec2-branch"
      ).length,
      slotCount * 2
    );
  }
});

test("pulse perimeter subpaths exactly reuse their static upper and lower geometry", () => {
  const staticRails = getLiveObservationStaticRailPaths(2);
  const upper = getLiveObservationPulsePath({
    lane: "upper",
    slotCount: 2,
    targetIndex: 0
  });
  const lower = getLiveObservationPulsePath({
    lane: "lower",
    slotCount: 2,
    targetIndex: 1
  });
  const laneCases = [
    {
      lane: "upper" as const,
      nodes: [
        LIVE_OBSERVATION_SIGNAL_NODES.audience,
        LIVE_OBSERVATION_SIGNAL_NODES.s3,
        LIVE_OBSERVATION_SIGNAL_NODES.alb,
        LIVE_OBSERVATION_SIGNAL_NODES.asg,
        LIVE_OBSERVATION_SIGNAL_NODES.ec2Upper
      ],
      pulsePath: upper
    },
    {
      lane: "lower" as const,
      nodes: [
        LIVE_OBSERVATION_SIGNAL_NODES.audience,
        LIVE_OBSERVATION_SIGNAL_NODES.s3,
        LIVE_OBSERVATION_SIGNAL_NODES.alb,
        LIVE_OBSERVATION_SIGNAL_NODES.asg,
        LIVE_OBSERVATION_SIGNAL_NODES.ec2Lower
      ],
      pulsePath: lower
    }
  ];

  for (const { lane, nodes, pulsePath } of laneCases) {
    for (const [index, node] of nodes.entries()) {
      const expectedPath = getExpectedOutsidePerimeterPath(node, lane);
      const staticPath = staticRails.find(
        (rail) => rail.kind === "perimeter" && rail.d === expectedPath
      );

      assert.ok(staticPath);
      assert.equal(
        pulsePath.includes(index === 0 ? staticPath.d : stripInitialMove(staticPath.d)),
        true
      );
    }
  }

  assert.notEqual(upper, lower);
  assert.match(upper, /L 350 278/);
  assert.match(lower, /L 350 362/);
  assert.doesNotMatch(upper, /L 350 320/);
  assert.doesNotMatch(lower, /L 350 320/);
});

test("a single centered EC2 slot uses two straight ASG branches", () => {
  const branches = getLiveObservationStaticRailPaths(1).filter(
    (rail) => rail.kind === "ec2-branch"
  );

  assert.deepEqual(branches, [
    {
      d: "M 1160 278 L 1310 278",
      kind: "ec2-branch",
      lane: "upper",
      nodeId: "ec2-0",
      targetIndex: 0
    },
    {
      d: "M 1160 362 L 1310 362",
      kind: "ec2-branch",
      lane: "lower",
      nodeId: "ec2-0",
      targetIndex: 0
    }
  ]);
  assert.match(
    getLiveObservationPulsePath({ lane: "upper", slotCount: 1, targetIndex: 0 }),
    /L 1310 278/
  );
});

test("pulse paths reject unavailable EC2 targets", () => {
  assert.equal(
    getLiveObservationPulsePath({ lane: "upper", slotCount: 0, targetIndex: 0 }),
    ""
  );
  assert.equal(
    getLiveObservationPulsePath({ lane: "lower", slotCount: 1, targetIndex: 1 }),
    ""
  );
});

test("signal map consumes the shared static and pulse path outputs", () => {
  const signalMapSource = readFileSync(
    fileURLToPath(new URL("LiveObservationSignalMap.tsx", import.meta.url)),
    "utf8"
  );

  assert.match(signalMapSource, /getLiveObservationStaticRailPaths\(instanceSlots\.length\)/);
  assert.match(signalMapSource, /d=\{rail\.d\}/);
  assert.match(signalMapSource, /getLiveObservationSignalRouteSelections\(\{/);
  assert.match(signalMapSource, /d=\{selection\.path\}/);
  assert.match(signalMapSource, /data-signal-lane=\{selection\.lane\}/);
});
