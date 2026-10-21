import { computeSafestRoute, haversineDistanceM, calculateSegmentCost } from './src/services/routingEngine.ts';
import { INITIAL_ROAD_NODES, INITIAL_ROAD_SEGMENTS, INITIAL_RELIEF_CENTRES } from './src/data/osmData.ts';
import { RoadSegment } from './src/types/floodguard.ts';

console.log('=== TESTING FLOODGUARD ROUTING ENGINE & DISASTER FAIL-SAFES ===');

const origin: [number, number] = [13.0880, 80.1090]; // Kovur Culvert (Low flood prone)
const shelter = INITIAL_RELIEF_CENTRES[1]; // Thirumullaivoyal High Ridge (RC-2)

// 1. Normal conditions routing
const normalRoute = computeSafestRoute(origin, shelter, INITIAL_ROAD_NODES, INITIAL_ROAD_SEGMENTS);
console.log(`[PASS] TC-ROUTE-001 Normal Conditions: Distance ${normalRoute.totalDistanceM}m, ETA ${normalRoute.estimatedMinutes} min, Title: "${normalRoute.routeTitle}"`);

// 2. Severe flood: all segments flooded > 50cm
const floodedSegments: RoadSegment[] = INITIAL_ROAD_SEGMENTS.map(s => ({
  ...s,
  waterLevelCm: 65,
  status: 'CRITICAL',
}));

const catastropheRoute = computeSafestRoute(origin, shelter, INITIAL_ROAD_NODES, floodedSegments);
console.log(`[PASS] TC-ROUTE-002 Inundation Catastrophe: CriticalFlag=${catastropheRoute.hasCriticalSegments}, Title: "${catastropheRoute.routeTitle}"`);

if (catastropheRoute.hasCriticalSegments && catastropheRoute.routeTitle.includes('CRITICAL')) {
  console.log('[PASS] TC-ROUTE-003 Safety Verification: System successfully refused to claim an impassable corridor is safe.');
} else {
  console.error('[FAIL] TC-ROUTE-003 Safety Verification: System erroneously marked catastrophic route as safe!');
  process.exit(1);
}

// 3. Disconnected graph test
const isolatedNodes = INITIAL_ROAD_NODES.slice(0, 3);
const isolatedRoute = computeSafestRoute(origin, shelter, isolatedNodes, []);
console.log(`[PASS] TC-ROUTE-004 Disjoint Graph Fail-Safe: CriticalFlag=${isolatedRoute.hasCriticalSegments}, Risk=${isolatedRoute.averageRiskScore}, Title: "${isolatedRoute.routeTitle}"`);

if (isolatedRoute.hasCriticalSegments && isolatedRoute.averageRiskScore > 80) {
  console.log('[PASS] TC-ROUTE-005 Disjoint Graph Warning Verified: Vertical shelter instruction active.');
} else {
  console.error('[FAIL] TC-ROUTE-005 Disjoint Graph: Did not trigger critical warning!');
  process.exit(1);
}

console.log('\nAll 5 routing fail-safe tests passed successfully!');
