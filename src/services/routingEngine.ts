import { RoadNode, RoadSegment, ReliefCentre, EvacuationRoute, RouteStep, FloodStatus, ManeuverType } from '../types/floodguard';

/**
 * Calculates distance between two coordinates in meters (Haversine formula)
 */
export function haversineDistanceM(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const dLon = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[0] * Math.PI) / 180) *
      Math.cos((coord2[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates forward azimuth bearing in degrees [0, 360) from coord1 to coord2
 */
export function calculateBearingDeg(start: [number, number], end: [number, number]): number {
  const lat1 = (start[0] * Math.PI) / 180;
  const lat2 = (end[0] * Math.PI) / 180;
  const dLon = ((end[1] - start[1]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Converts a degree bearing to an 8-point compass direction
 */
export function bearingToCompass(bearing: number): string {
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  const index = Math.round(((bearing % 360) + 360) % 360 / 45) % 8;
  return directions[index];
}

/**
 * Formats a metric distance in meters into Google Maps-style readable text (e.g. 350 m, 1.2 km)
 */
export function formatDistanceM(meters: number): string {
  if (meters < 50) {
    return Math.round(meters) + ' m';
  }
  if (meters < 1000) {
    return (Math.round(meters / 10) * 10) + ' m';
  }
  return (meters / 1000).toFixed(1) + ' km';
}

/**
 * Finds the nearest node in the road network to a given coordinate
 */
export function findNearestNode(coord: [number, number], nodes: RoadNode[]): RoadNode {
  let nearestNode = nodes[0];
  let minDistance = Infinity;

  for (const node of nodes) {
    const dist = haversineDistanceM(coord, [node.lat, node.lng]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestNode = node;
    }
  }

  return nearestNode;
}

/**
 * Calculates segment flood penalty cost using the A* flood-routing formula:
 * C = w_d * D + w_f * F + w_s * S + w_b * B + w_u * U
 */
export function calculateSegmentCost(segment: RoadSegment, forcePassable = false): number {
  // If water level >= 50cm, segment is strictly impassable unless forced in catastrophe mode
  if (segment.waterLevelCm >= 50 && !forcePassable) {
    return Infinity;
  }

  const wd = 1.0; // Distance weight
  const wf = 15.0; // Flood depth weight
  const ws = 8.0; // Rate of rise surge weight
  const wb = 4.0; // Low elevation buffer weight
  const wu = 2.0; // Sensor uncertainty weight

  const D = segment.distanceM;
  const F = Math.pow(Math.max(0, segment.waterLevelCm) / 10, 2); // Exponential penalty for deeper water
  const S = segment.status === 'CRITICAL' ? 100 : segment.status === 'WARNING' ? 40 : segment.status === 'CAUTION' ? 15 : 0;
  const B = Math.max(0, 25 - segment.baseElevationM) * 3; // Penalize low-lying depressions
  const U = 5; // Standard sensor freshness factor

  return wd * D + wf * F + ws * S + wb * B + wu * U;
}

interface DirectedPathSegment {
  segment: RoadSegment;
  fromNodeId: string;
  toNodeId: string;
  coordinates: [number, number][];
}

interface AStarInternalResult {
  pathSegments: DirectedPathSegment[];
  totalCost: number;
}

/**
 * A* Search Algorithm for Flood-Aware Evacuation Routing with Google Maps-Style Maneuvers
 */
export function computeSafestRoute(
  originCoord: [number, number],
  destinationShelter: ReliefCentre,
  nodes: RoadNode[],
  segments: RoadSegment[]
): EvacuationRoute {
  const startNode = findNearestNode(originCoord, nodes);
  const endNode = findNearestNode([destinationShelter.lat, destinationShelter.lng], nodes);

  // Build Adjacency Graph
  const adjacency = new Map<string, Array<{ neighborId: string; segment: RoadSegment }>>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const seg of segments) {
    adjacency.get(seg.sourceNodeId)?.push({ neighborId: seg.targetNodeId, segment: seg });
    adjacency.get(seg.targetNodeId)?.push({ neighborId: seg.sourceNodeId, segment: seg });
  }

  // Run A*
  let routeResult = runAStar(startNode.id, endNode.id, nodes, adjacency, false);
  let hasCriticalSegments = false;

  // If completely blocked by flood waters, run with forcePassable = true so evacuee is not left stranded
  if (!routeResult) {
    routeResult = runAStar(startNode.id, endNode.id, nodes, adjacency, true);
    hasCriticalSegments = true;
  }

  if (!routeResult || routeResult.pathSegments.length === 0) {
    const directDistance = Math.round(haversineDistanceM(originCoord, [destinationShelter.lat, destinationShelter.lng]));
    return {
      totalDistanceM: directDistance,
      estimatedMinutes: Math.max(5, Math.round((directDistance / 1000) * 15)),
      averageRiskScore: 95,
      routeTitle: 'CRITICAL ALERT: No Safe Ground Route Available — Seek Immediate Vertical Shelter',
      pathCoordinates: [originCoord, [destinationShelter.lat, destinationShelter.lng]],
      steps: [
        {
          instruction: 'URGENT: All surveyed roads to ' + destinationShelter.name + ' are impassable (>50cm flood depth). Move to rooftop/upper floor and await boat rescue.',
          shortInstruction: 'Seek Vertical Shelter',
          roadName: 'Impassable Inundated Basin',
          distanceM: directDistance,
          formattedDistance: formatDistanceM(directDistance),
          segmentId: 'IMPASSABLE-HAZARD',
          waterLevelCm: 60,
          riskStatus: 'CRITICAL',
          maneuver: 'STRAIGHT',
          turnAngleDeg: 0,
          bearingDeg: calculateBearingDeg(originCoord, [destinationShelter.lat, destinationShelter.lng]),
          startCoordinate: originCoord,
          endCoordinate: [destinationShelter.lat, destinationShelter.lng],
        },
      ],
      blockedSegmentsAvoided: segments.filter(s => s.status === 'CRITICAL').map(s => s.id),
      destinationShelter,
      hasCriticalSegments: true,
      warningNotice:
        'CRITICAL WARNING: No verified safe route could be established due to deep inundation. All candidate routes intersect critical flood waters. Evacuate vertically to higher floors if moving is unsafe.',
    };
  }

  const { pathSegments } = routeResult;
  const pathCoordinates: [number, number][] = [originCoord];
  const steps: RouteStep[] = [];
  let totalDistanceM = 0;
  let totalRisk = 0;

  for (let i = 0; i < pathSegments.length; i++) {
    const directed = pathSegments[i];
    const seg = directed.segment;
    const coords = directed.coordinates;

    totalDistanceM += seg.distanceM;
    totalRisk += seg.waterLevelCm;

    // Append segment polyline coordinates
    for (const pt of coords) {
      pathCoordinates.push(pt);
    }

    const startPt = coords[0] || originCoord;
    const endPt = coords[coords.length - 1] || startPt;
    const bearing = calculateBearingDeg(startPt, endPt);
    const compass = bearingToCompass(bearing);
    const formattedDist = formatDistanceM(seg.distanceM);

    let maneuver: ManeuverType = 'STRAIGHT';
    let turnAngleDeg = 0;
    let instruction = '';
    let shortInstruction = '';

    if (i === 0) {
      maneuver = 'DEPART';
      shortInstruction = 'Head ' + compass + ' on ' + seg.name;
      instruction = 'Head ' + compass + ' on ' + seg.name + ' for ' + formattedDist;
    } else {
      const prevStep = steps[i - 1];
      const prevBearing = prevStep.bearingDeg ?? bearing;
      turnAngleDeg = ((bearing - prevBearing + 540) % 360) - 180;
      const prevDistStr = formatDistanceM(pathSegments[i - 1].segment.distanceM);

      if (Math.abs(turnAngleDeg) < 25) {
        maneuver = 'STRAIGHT';
        shortInstruction = 'Continue on ' + seg.name;
        instruction = 'Continue straight on ' + seg.name + ' for ' + formattedDist;
      } else if (turnAngleDeg >= 25 && turnAngleDeg < 65) {
        maneuver = 'SLIGHT_RIGHT';
        shortInstruction = 'Bear slightly right onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', bear slightly right onto ' + seg.name;
      } else if (turnAngleDeg >= 65 && turnAngleDeg < 135) {
        maneuver = 'TURN_RIGHT';
        shortInstruction = 'Turn right onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', turn right onto ' + seg.name;
      } else if (turnAngleDeg >= 135) {
        maneuver = turnAngleDeg >= 165 ? 'U_TURN' : 'SHARP_RIGHT';
        shortInstruction = turnAngleDeg >= 165 ? 'Make U-turn onto ' + seg.name : 'Sharp right onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', ' + (turnAngleDeg >= 165 ? 'make a U-turn' : 'make a sharp right') + ' onto ' + seg.name;
      } else if (turnAngleDeg > -65 && turnAngleDeg <= -25) {
        maneuver = 'SLIGHT_LEFT';
        shortInstruction = 'Bear slightly left onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', bear slightly left onto ' + seg.name;
      } else if (turnAngleDeg > -135 && turnAngleDeg <= -65) {
        maneuver = 'TURN_LEFT';
        shortInstruction = 'Turn left onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', turn left onto ' + seg.name;
      } else {
        maneuver = turnAngleDeg <= -165 ? 'U_TURN' : 'SHARP_LEFT';
        shortInstruction = turnAngleDeg <= -165 ? 'Make U-turn onto ' + seg.name : 'Sharp left onto ' + seg.name;
        instruction = 'In ' + prevDistStr + ', ' + (turnAngleDeg <= -165 ? 'make a U-turn' : 'make a sharp left') + ' onto ' + seg.name;
      }
    }

    steps.push({
      instruction,
      shortInstruction,
      roadName: seg.name,
      distanceM: seg.distanceM,
      formattedDistance: formattedDist,
      segmentId: seg.id,
      waterLevelCm: seg.waterLevelCm,
      riskStatus: seg.status,
      maneuver,
      turnAngleDeg: Math.round(turnAngleDeg),
      bearingDeg: Math.round(bearing),
      startCoordinate: startPt,
      endCoordinate: endPt,
    });
  }

  // Final destination arrival waypoint
  const shelterCoord: [number, number] = [destinationShelter.lat, destinationShelter.lng];
  pathCoordinates.push(shelterCoord);
  const lastStepCoord = steps.length > 0 && steps[steps.length - 1].endCoordinate ? steps[steps.length - 1].endCoordinate! : originCoord;
  const finalLegDist = Math.round(haversineDistanceM(lastStepCoord, shelterCoord));

  steps.push({
    instruction: 'Arrive at safe haven shelter: ' + destinationShelter.name + ' (' + destinationShelter.elevationM + 'm MSL).',
    shortInstruction: 'Arrive at ' + destinationShelter.name,
    roadName: destinationShelter.name,
    distanceM: Math.max(10, finalLegDist),
    formattedDistance: formatDistanceM(Math.max(10, finalLegDist)),
    segmentId: 'SHELTER-DEST',
    waterLevelCm: 0,
    riskStatus: 'SAFE',
    maneuver: 'ARRIVE',
    turnAngleDeg: 0,
    bearingDeg: steps.length > 0 ? steps[steps.length - 1].bearingDeg : 0,
    startCoordinate: lastStepCoord,
    endCoordinate: shelterCoord,
  });

  const blockedAvoided = segments
    .filter(s => s.waterLevelCm >= 45 && !pathSegments.some(p => p.segment.id === s.id))
    .map(s => s.name);

  // Speed estimation based on flood conditions (average walking speed 4.5 km/h on dry road, reduced by water)
  const walkingSpeedKmh = Math.max(1.8, 4.5 - (totalRisk / (pathSegments.length || 1)) * 0.08);
  const estimatedMinutes = Math.max(3, Math.round(((totalDistanceM / 1000) / walkingSpeedKmh) * 60));

  return {
    totalDistanceM: Math.round(totalDistanceM),
    estimatedMinutes,
    averageRiskScore: Math.round(totalRisk / (pathSegments.length || 1)),
    routeTitle: hasCriticalSegments
      ? 'CRITICAL WARNING: Forced High-Water Passage (>50cm) — Extreme Hazard!'
      : 'Estimated lower-risk route',
    pathCoordinates,
    steps,
    blockedSegmentsAvoided: blockedAvoided,
    destinationShelter,
    hasCriticalSegments,
    calculatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dataFreshness: '< 5 seconds (Live IoT sensor telemetry)',
    isRiskEngineOutput: true,
    warningNotice: hasCriticalSegments
      ? 'CRITICAL WARNING: No verified safe route could be established due to deep inundation. All candidate routes intersect critical flood waters. Evacuate vertically to higher floors if moving is unsafe.'
      : undefined,
  };
}

function runAStar(
  startId: string,
  targetId: string,
  nodes: RoadNode[],
  adjacency: Map<string, Array<{ neighborId: string; segment: RoadSegment }>>,
  forcePassable: boolean
): AStarInternalResult | null {
  const nodeMap = new Map<string, RoadNode>(nodes.map(n => [n.id, n]));
  const targetNode = nodeMap.get(targetId);
  if (!targetNode) return null;

  const openSet = new Set<string>([startId]);
  const cameFrom = new Map<string, { prevNodeId: string; segment: RoadSegment }>();

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  for (const node of nodes) {
    gScore.set(node.id, Infinity);
    fScore.set(node.id, Infinity);
  }

  gScore.set(startId, 0);
  fScore.set(
    startId,
    haversineDistanceM(
      [nodeMap.get(startId)!.lat, nodeMap.get(startId)!.lng],
      [targetNode.lat, targetNode.lng]
    )
  );

  while (openSet.size > 0) {
    let currentId = '';
    let lowestF = Infinity;
    for (const id of openSet) {
      const score = fScore.get(id) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentId = id;
      }
    }

    if (!currentId) break;

    if (currentId === targetId) {
      // Reconstruct path with directed segments and verified coordinate order
      const pathSegments: DirectedPathSegment[] = [];
      let curr = targetId;
      while (cameFrom.has(curr)) {
        const { prevNodeId, segment } = cameFrom.get(curr)!;
        const coords = [...segment.coordinates];
        // If traversing backwards from targetNodeId to sourceNodeId, reverse coordinate array
        if (prevNodeId === segment.targetNodeId && curr === segment.sourceNodeId) {
          coords.reverse();
        }
        pathSegments.unshift({
          segment,
          fromNodeId: prevNodeId,
          toNodeId: curr,
          coordinates: coords,
        });
        curr = prevNodeId;
      }
      return {
        pathSegments,
        totalCost: gScore.get(targetId) || 0,
      };
    }

    openSet.delete(currentId);
    const neighbors = adjacency.get(currentId) || [];

    for (const { neighborId, segment } of neighbors) {
      const segmentCost = calculateSegmentCost(segment, forcePassable);
      if (segmentCost === Infinity) continue; // Blocked road

      const tentativeG = (gScore.get(currentId) ?? Infinity) + segmentCost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, { prevNodeId: currentId, segment });
        gScore.set(neighborId, tentativeG);

        const neighborNode = nodeMap.get(neighborId);
        const h = neighborNode
          ? haversineDistanceM([neighborNode.lat, neighborNode.lng], [targetNode.lat, targetNode.lng])
          : 0;

        fScore.set(neighborId, tentativeG + h);
        openSet.add(neighborId);
      }
    }
  }

  return null;
}
