export type LiveObservationSignalLane = "upper" | "lower";
export type LiveObservationMobileSignalLane = "left" | "right";
export type LiveObservationStaticRailLane =
  | LiveObservationSignalLane
  | LiveObservationMobileSignalLane;

export type LiveObservationSignalNodeRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}>;

export type LiveObservationStaticRail = Readonly<{
  d: string;
  kind: "perimeter" | "connector" | "ec2-branch";
  lane: LiveObservationStaticRailLane;
  nodeId: string;
  targetIndex?: number;
}>;

type RailPoint = Readonly<{
  x: number;
  y: number;
}>;

const RAIL_CLEARANCE = 10;
const MOBILE_RAIL_CLEARANCE = 2;

function freezeNodeRect(rect: LiveObservationSignalNodeRect): LiveObservationSignalNodeRect {
  return Object.freeze(rect);
}

export const LIVE_OBSERVATION_SIGNAL_VIEWBOX = "0 0 1600 640";
export const LIVE_OBSERVATION_MOBILE_SIGNAL_VIEWBOX = "0 0 100 180";

export const LIVE_OBSERVATION_SIGNAL_NODES = Object.freeze({
  audience: freezeNodeRect({ x: 70, y: 250, width: 190, height: 140, radius: 28 }),
  s3: freezeNodeRect({ x: 360, y: 250, width: 190, height: 140, radius: 28 }),
  alb: freezeNodeRect({ x: 650, y: 250, width: 190, height: 140, radius: 28 }),
  asg: freezeNodeRect({ x: 940, y: 250, width: 210, height: 140, radius: 28 }),
  ec2Single: freezeNodeRect({ x: 1320, y: 250, width: 190, height: 140, radius: 28 }),
  ec2Upper: freezeNodeRect({ x: 1320, y: 100, width: 190, height: 140, radius: 28 }),
  ec2Lower: freezeNodeRect({ x: 1320, y: 400, width: 190, height: 140, radius: 28 })
});

export const LIVE_OBSERVATION_MOBILE_SIGNAL_NODES = Object.freeze({
  audience: freezeNodeRect({ x: 20, y: 10, width: 60, height: 20, radius: 5 }),
  s3: freezeNodeRect({ x: 20, y: 42, width: 60, height: 20, radius: 5 }),
  alb: freezeNodeRect({ x: 20, y: 74, width: 60, height: 20, radius: 5 }),
  asg: freezeNodeRect({ x: 20, y: 106, width: 60, height: 20, radius: 5 }),
  ec2Single: freezeNodeRect({ x: 30, y: 148, width: 40, height: 20, radius: 5 }),
  ec2Left: freezeNodeRect({ x: 4, y: 148, width: 42, height: 20, radius: 5 }),
  ec2Right: freezeNodeRect({ x: 54, y: 148, width: 42, height: 20, radius: 5 })
});

const BASE_SIGNAL_NODES = [
  LIVE_OBSERVATION_SIGNAL_NODES.audience,
  LIVE_OBSERVATION_SIGNAL_NODES.s3,
  LIVE_OBSERVATION_SIGNAL_NODES.alb,
  LIVE_OBSERVATION_SIGNAL_NODES.asg
] as const;
const BASE_SIGNAL_NODE_IDS = ["audience", "s3", "alb", "asg"] as const;

const BASE_MOBILE_SIGNAL_NODES = [
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.audience,
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.s3,
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.alb,
  LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.asg
] as const;

function getNodeLaneEntry(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationSignalLane
): RailPoint {
  return {
    x: rect.x - RAIL_CLEARANCE,
    y: lane === "upper"
      ? rect.y + rect.radius
      : rect.y + rect.height - rect.radius
  };
}

function getNodeLaneExit(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationSignalLane
): RailPoint {
  return {
    x: rect.x + rect.width + RAIL_CLEARANCE,
    y: getNodeLaneEntry(rect, lane).y
  };
}

function getMobileNodeLaneEntry(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationMobileSignalLane
): RailPoint {
  return {
    x: lane === "left"
      ? rect.x + rect.radius
      : rect.x + rect.width - rect.radius,
    y: rect.y - MOBILE_RAIL_CLEARANCE
  };
}

function getMobileNodeLaneExit(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationMobileSignalLane
): RailPoint {
  return {
    x: getMobileNodeLaneEntry(rect, lane).x,
    y: rect.y + rect.height + MOBILE_RAIL_CLEARANCE
  };
}

function buildPerimeterPath(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationSignalLane,
  startsPath: boolean
): string {
  const entry = getNodeLaneEntry(rect, lane);
  const exit = getNodeLaneExit(rect, lane);
  const offsetRadius = rect.radius + RAIL_CLEARANCE;
  const leftTangentX = rect.x + rect.radius;
  const rightTangentX = rect.x + rect.width - rect.radius;
  const start = startsPath ? `M ${entry.x} ${entry.y} ` : "";

  return lane === "upper"
    ? `${start}A ${offsetRadius} ${offsetRadius} 0 0 1 ${leftTangentX} ${rect.y - RAIL_CLEARANCE} L ${rightTangentX} ${rect.y - RAIL_CLEARANCE} A ${offsetRadius} ${offsetRadius} 0 0 1 ${exit.x} ${exit.y}`
    : `${start}A ${offsetRadius} ${offsetRadius} 0 0 0 ${leftTangentX} ${rect.y + rect.height + RAIL_CLEARANCE} L ${rightTangentX} ${rect.y + rect.height + RAIL_CLEARANCE} A ${offsetRadius} ${offsetRadius} 0 0 0 ${exit.x} ${exit.y}`;
}

function buildMobilePerimeterPath(
  rect: LiveObservationSignalNodeRect,
  lane: LiveObservationMobileSignalLane,
  startsPath: boolean
): string {
  const entry = getMobileNodeLaneEntry(rect, lane);
  const exit = getMobileNodeLaneExit(rect, lane);
  const offsetRadius = rect.radius + MOBILE_RAIL_CLEARANCE;
  const topTangentY = rect.y + rect.radius;
  const bottomTangentY = rect.y + rect.height - rect.radius;
  const start = startsPath ? `M ${entry.x} ${entry.y} ` : "";

  return lane === "left"
    ? `${start}A ${offsetRadius} ${offsetRadius} 0 0 0 ${rect.x - MOBILE_RAIL_CLEARANCE} ${topTangentY} L ${rect.x - MOBILE_RAIL_CLEARANCE} ${bottomTangentY} A ${offsetRadius} ${offsetRadius} 0 0 0 ${exit.x} ${exit.y}`
    : `${start}A ${offsetRadius} ${offsetRadius} 0 0 1 ${rect.x + rect.width + MOBILE_RAIL_CLEARANCE} ${topTangentY} L ${rect.x + rect.width + MOBILE_RAIL_CLEARANCE} ${bottomTangentY} A ${offsetRadius} ${offsetRadius} 0 0 1 ${exit.x} ${exit.y}`;
}

function buildConnectorPath(from: RailPoint, to: RailPoint, startsPath: boolean): string {
  return startsPath
    ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    : `L ${to.x} ${to.y}`;
}

function buildBranchPath(from: RailPoint, to: RailPoint, startsPath: boolean): string {
  if (from.y === to.y) {
    return buildConnectorPath(from, to, startsPath);
  }

  const midpointX = from.x + (to.x - from.x) / 2;
  const start = startsPath ? `M ${from.x} ${from.y} ` : "";

  return `${start}C ${midpointX} ${from.y} ${midpointX} ${to.y} ${to.x} ${to.y}`;
}

function buildMobileBranchPath(
  from: RailPoint,
  to: RailPoint,
  startsPath: boolean
): string {
  if (from.x === to.x) {
    return buildConnectorPath(from, to, startsPath);
  }

  const midpointY = from.y + (to.y - from.y) / 2;
  const start = startsPath ? `M ${from.x} ${from.y} ` : "";

  return `${start}C ${from.x} ${midpointY} ${to.x} ${midpointY} ${to.x} ${to.y}`;
}

function getDisplayedSlotCount(slotCount: number): 0 | 1 | 2 {
  if (!Number.isFinite(slotCount) || slotCount <= 0) {
    return 0;
  }

  return slotCount < 2 ? 1 : 2;
}

function getEc2NodeRects(slotCount: number): readonly LiveObservationSignalNodeRect[] {
  return getDisplayedSlotCount(slotCount) === 0
    ? []
    : getDisplayedSlotCount(slotCount) === 1
      ? [LIVE_OBSERVATION_SIGNAL_NODES.ec2Single]
      : [
          LIVE_OBSERVATION_SIGNAL_NODES.ec2Upper,
          LIVE_OBSERVATION_SIGNAL_NODES.ec2Lower
        ];
}

function getMobileEc2NodeRects(
  slotCount: number
): readonly LiveObservationSignalNodeRect[] {
  return getDisplayedSlotCount(slotCount) === 0
    ? []
    : getDisplayedSlotCount(slotCount) === 1
      ? [LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Single]
      : [
          LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Left,
          LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.ec2Right
        ];
}

export function getLiveObservationStaticRailPaths(
  slotCount: number
): LiveObservationStaticRail[] {
  const rails: LiveObservationStaticRail[] = [];

  for (const [index, node] of BASE_SIGNAL_NODES.entries()) {
    const nodeId = BASE_SIGNAL_NODE_IDS[index] ?? `node-${index}`;
    rails.push(
      {
        d: buildPerimeterPath(node, "upper", true),
        kind: "perimeter",
        lane: "upper",
        nodeId
      },
      {
        d: buildPerimeterPath(node, "lower", true),
        kind: "perimeter",
        lane: "lower",
        nodeId
      }
    );
  }

  for (let index = 0; index < BASE_SIGNAL_NODES.length - 1; index += 1) {
    const currentNode = BASE_SIGNAL_NODES[index];
    const nextNode = BASE_SIGNAL_NODES[index + 1];

    if (!currentNode || !nextNode) {
      continue;
    }

    for (const lane of ["upper", "lower"] as const) {
      rails.push({
        d: buildConnectorPath(
          getNodeLaneExit(currentNode, lane),
          getNodeLaneEntry(nextNode, lane),
          true
        ),
        kind: "connector",
        lane,
        nodeId: BASE_SIGNAL_NODE_IDS[index + 1] ?? `connector-${index}`
      });
    }
  }

  for (const [targetIndex, node] of getEc2NodeRects(slotCount).entries()) {
    for (const lane of ["upper", "lower"] as const) {
      rails.push({
        d: buildBranchPath(
          getNodeLaneExit(LIVE_OBSERVATION_SIGNAL_NODES.asg, lane),
          getNodeLaneEntry(node, lane),
          true
        ),
        kind: "ec2-branch",
        lane,
        nodeId: `ec2-${targetIndex}`,
        targetIndex
      });
    }
    rails.push(
      {
        d: buildPerimeterPath(node, "upper", true),
        kind: "perimeter",
        lane: "upper",
        nodeId: `ec2-${targetIndex}`
      },
      {
        d: buildPerimeterPath(node, "lower", true),
        kind: "perimeter",
        lane: "lower",
        nodeId: `ec2-${targetIndex}`
      }
    );
  }

  return rails;
}

export function getLiveObservationMobileStaticRailPaths(
  slotCount: number
): LiveObservationStaticRail[] {
  const rails: LiveObservationStaticRail[] = [];

  for (const [index, node] of BASE_MOBILE_SIGNAL_NODES.entries()) {
    const nodeId = BASE_SIGNAL_NODE_IDS[index] ?? `node-${index}`;
    rails.push(
      {
        d: buildMobilePerimeterPath(node, "left", true),
        kind: "perimeter",
        lane: "left",
        nodeId
      },
      {
        d: buildMobilePerimeterPath(node, "right", true),
        kind: "perimeter",
        lane: "right",
        nodeId
      }
    );
  }

  for (let index = 0; index < BASE_MOBILE_SIGNAL_NODES.length - 1; index += 1) {
    const currentNode = BASE_MOBILE_SIGNAL_NODES[index];
    const nextNode = BASE_MOBILE_SIGNAL_NODES[index + 1];

    if (!currentNode || !nextNode) {
      continue;
    }

    for (const lane of ["left", "right"] as const) {
      rails.push({
        d: buildConnectorPath(
          getMobileNodeLaneExit(currentNode, lane),
          getMobileNodeLaneEntry(nextNode, lane),
          true
        ),
        kind: "connector",
        lane,
        nodeId: BASE_SIGNAL_NODE_IDS[index + 1] ?? `connector-${index}`
      });
    }
  }

  for (const [targetIndex, node] of getMobileEc2NodeRects(slotCount).entries()) {
    for (const lane of ["left", "right"] as const) {
      rails.push({
        d: buildMobileBranchPath(
          getMobileNodeLaneExit(LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.asg, lane),
          getMobileNodeLaneEntry(node, lane),
          true
        ),
        kind: "ec2-branch",
        lane,
        nodeId: `ec2-${targetIndex}`,
        targetIndex
      });
    }
    rails.push(
      {
        d: buildMobilePerimeterPath(node, "left", true),
        kind: "perimeter",
        lane: "left",
        nodeId: `ec2-${targetIndex}`
      },
      {
        d: buildMobilePerimeterPath(node, "right", true),
        kind: "perimeter",
        lane: "right",
        nodeId: `ec2-${targetIndex}`
      }
    );
  }

  return rails;
}

export function getLiveObservationPulsePath({
  lane,
  slotCount,
  targetIndex
}: {
  readonly lane: LiveObservationSignalLane;
  readonly slotCount: number;
  readonly targetIndex: number;
}): string {
  const targetNode = getEc2NodeRects(slotCount)[targetIndex];

  if (!targetNode) {
    return "";
  }

  const pathSegments: string[] = [];
  for (const [index, node] of BASE_SIGNAL_NODES.entries()) {
    pathSegments.push(buildPerimeterPath(node, lane, index === 0));

    const nextNode = BASE_SIGNAL_NODES[index + 1];
    if (nextNode) {
      pathSegments.push(
        buildConnectorPath(
          getNodeLaneExit(node, lane),
          getNodeLaneEntry(nextNode, lane),
          false
        )
      );
    }
  }

  pathSegments.push(
    buildBranchPath(
      getNodeLaneExit(LIVE_OBSERVATION_SIGNAL_NODES.asg, lane),
      getNodeLaneEntry(targetNode, lane),
      false
    ),
    buildPerimeterPath(targetNode, lane, false)
  );

  return pathSegments.join(" ");
}

export function getLiveObservationMobilePulsePath({
  lane,
  slotCount,
  targetIndex
}: {
  readonly lane: LiveObservationMobileSignalLane;
  readonly slotCount: number;
  readonly targetIndex: number;
}): string {
  const targetNode = getMobileEc2NodeRects(slotCount)[targetIndex];

  if (!targetNode) {
    return "";
  }

  const pathSegments: string[] = [];
  for (const [index, node] of BASE_MOBILE_SIGNAL_NODES.entries()) {
    pathSegments.push(buildMobilePerimeterPath(node, lane, index === 0));

    const nextNode = BASE_MOBILE_SIGNAL_NODES[index + 1];
    if (nextNode) {
      pathSegments.push(
        buildConnectorPath(
          getMobileNodeLaneExit(node, lane),
          getMobileNodeLaneEntry(nextNode, lane),
          false
        )
      );
    }
  }

  pathSegments.push(
    buildMobileBranchPath(
      getMobileNodeLaneExit(LIVE_OBSERVATION_MOBILE_SIGNAL_NODES.asg, lane),
      getMobileNodeLaneEntry(targetNode, lane),
      false
    ),
    buildMobilePerimeterPath(targetNode, lane, false)
  );

  return pathSegments.join(" ");
}
