// Block plans per game mode. The city builder turns a plan into geometry + colliders.
export const P_BLOCK = 44, P_ROAD = 12, PITCH = P_BLOCK + P_ROAD;

export function roadX(plan, i) { return (i - plan.cols / 2) * PITCH; }
export function roadZ(plan, j) { return (j - plan.rows / 2) * PITCH; }
export function blockRect(plan, i, j) {
  return { x0: roadX(plan, i) + P_ROAD / 2, x1: roadX(plan, i + 1) - P_ROAD / 2, z0: roadZ(plan, j) + P_ROAD / 2, z1: roadZ(plan, j + 1) - P_ROAD / 2 };
}

function emptyPlan(cols, rows) {
  const blocks = [];
  for (let j = 0; j < rows; j++) { blocks.push([]); for (let i = 0; i < cols; i++) blocks[j].push('bld'); }
  return { cols, rows, B: P_BLOCK, R: P_ROAD, P: PITCH, blocks, clear: null, arena: null, ring: null, roundabouts: [], noPropRects: [],
    minX: (-cols / 2) * PITCH, maxX: (cols / 2) * PITCH, minZ: (-rows / 2) * PITCH, maxZ: (rows / 2) * PITCH };
}

/** Small neighbourhood for the main menu backdrop: the hero truck sits at the central intersection. */
export function makeMenuPlan(rng) {
  const plan = emptyPlan(4, 4);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (rng.chance(0.15)) plan.blocks[j][i] = 'park';
  // the four blocks around the central intersection are parks (small trees only) so the orbiting camera never clips a building
  for (let j = 1; j <= 2; j++) for (let i = 1; i <= 2; i++) plan.blocks[j][i] = 'park';
  plan.smallParks = true;
  return plan;
}

export function makePlan(modeId, params, rng) {
  if (modeId === 'race') {
    const plan = emptyPlan(8, 8);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (rng.chance(0.12)) plan.blocks[j][i] = 'park';
    return plan;
  }
  if (modeId === 'rumble' || modeId === 'chairs') {
    const plan = emptyPlan(7, 7);
    const floor = modeId === 'rumble' ? 'pave' : 'grass';
    plan.clear = { i0: 2, i1: 4, j0: 2, j1: 4, floor };
    for (let j = 2; j <= 4; j++) for (let i = 2; i <= 4; i++) plan.blocks[j][i] = 'open';
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (plan.blocks[j][i] === 'bld' && rng.chance(0.1)) plan.blocks[j][i] = 'park';
    const half = (3 * P_BLOCK + 2 * P_ROAD) / 2; // 78
    plan.ring = { x: 0, z: 0, r: half - 14 };
    plan.openRect = { minX: -half, maxX: half, minZ: -half, maxZ: half };
    return plan;
  }
  if (modeId === 'soccer') {
    const plan = emptyPlan(5, 7);
    // arena spans blocks i 1..3 (x) and j 2..4 (z) => 156 x 156 cleared; pitch itself is inset
    plan.clear = { i0: 1, i1: 3, j0: 2, j1: 4, floor: 'pave' };
    for (let j = 2; j <= 4; j++) for (let i = 1; i <= 3; i++) plan.blocks[j][i] = 'open';
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (plan.blocks[j][i] === 'bld' && rng.chance(0.1)) plan.blocks[j][i] = 'park';
    const halfW = 38, halfL = 66;
    plan.arena = { minX: -halfW, maxX: halfW, minZ: -halfL, maxZ: halfL, goalHalf: 9, goalDepth: 8, wallH: 3 };
    plan.openRect = { minX: -78, maxX: 78, minZ: -78, maxZ: 78 };
    return plan;
  }
  throw new Error('unknown mode ' + modeId);
}
