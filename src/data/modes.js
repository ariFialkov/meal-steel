export const MODES = {
  race: {
    id: 'race', name: 'Race', icon: '🏁',
    players: { min: 4, max: 8 },
    time: null,
    winners: [[0.7, 0.2, 0.1], [0.5, 0.35, 0.15], [0.65, 0.25, 0.1], [0.85, 0.1, 0.05]],
    teams: false,
    blurb: 'Full-contact Grand Prix through the neighbourhood.',
  },
  rumble: {
    id: 'rumble', name: 'Rumble', icon: '💥',
    players: { fixed: 12 },
    time: { options: [30, 90, 180] },
    winners: [[1]],
    teams: false,
    blurb: 'Smash, serve and survive. Most points when the clock hits zero wins.',
  },
  soccer: {
    id: 'soccer', name: 'Soccer', icon: '⚽',
    players: { options: [6, 8, 10] },
    time: { fixed: 150 },
    winners: [[1]],
    teams: true,
    blurb: 'Futsal with food trucks. Whole winning team splits the pot.',
  },
  chairs: {
    id: 'chairs', name: 'Musical Chairs', icon: '🎵',
    players: { fixed: 16 },
    time: null,
    winners: [[1]],
    teams: false,
    blurb: 'When the music stops, park or perish.',
  },
};

export const NEIGHBOURHOODS = [
  { name: 'Burger Heights', palette: ['#e8d5b7', '#c97b4a', '#8e5a3c', '#f4e1c1', '#b5651d', '#d9a066'], roof: '#5a4634', ground: '#3b3b3f' },
  { name: 'Little Lisbon', palette: ['#f7e7ce', '#f2b880', '#9fd8cb', '#f28c8c', '#fff1a8', '#c3dbe8'], roof: '#c1573a', ground: '#45444a' },
  { name: 'Pho District', palette: ['#f6d6ad', '#e26d5a', '#ffe9a7', '#6aa84f', '#c76e2c', '#efe2ba'], roof: '#6a3b2e', ground: '#3a3d44' },
  { name: 'Downtown Deli', palette: ['#8a97a3', '#b7c4cf', '#4a5a6a', '#d6dde3', '#6e7f90', '#2f3b47'], roof: '#333c45', ground: '#2f3135' },
  { name: 'Sauce Side', palette: ['#c84b31', '#ecb365', '#346751', '#f2e3bc', '#9a3b3b', '#e8a87c'], roof: '#4c2a1e', ground: '#3f3a37' },
  { name: 'Noodle Narrows', palette: ['#2d4059', '#ea5455', '#f07b3f', '#ffd460', '#5b6c8f', '#f6f6f6'], roof: '#1e2a3a', ground: '#34363c' },
  { name: 'Sugar Hill', palette: ['#ffd6e0', '#c1fba4', '#fff3b0', '#a0e7e5', '#f7c8ff', '#ffe5b4'], roof: '#8e6c88', ground: '#454248' },
  { name: 'Grill Street', palette: ['#5c4033', '#8b5e3c', '#d9b382', '#3b2f2f', '#a67b5b', '#c4a484'], roof: '#2e2320', ground: '#3a3733' },
];

export const WEATHERS = [
  { name: 'Sunny', sky: 0x8fd3ff, fog: 0xbfe6ff, fogNear: 180, fogFar: 520, sun: 1.15, ambient: 0.65, sunColor: 0xfff2d0, hemi: [0xbfe6ff, 0x6b7a5a] },
  { name: 'Golden Hour', sky: 0xffb677, fog: 0xffcf9a, fogNear: 150, fogFar: 460, sun: 1.0, ambient: 0.55, sunColor: 0xffb060, hemi: [0xffd4a3, 0x6a5a4a] },
  { name: 'Overcast', sky: 0xb8c0c8, fog: 0xc8ced4, fogNear: 120, fogFar: 380, sun: 0.55, ambient: 0.9, sunColor: 0xe8ecf0, hemi: [0xc8ced4, 0x5a5f66] },
  { name: 'Night', sky: 0x0e1230, fog: 0x141a3a, fogNear: 90, fogFar: 320, sun: 0.25, ambient: 0.35, sunColor: 0x8fa3ff, hemi: [0x2a3670, 0x1a1626], night: true },
  { name: 'Foggy', sky: 0xd4d8dc, fog: 0xdadee2, fogNear: 40, fogFar: 200, sun: 0.5, ambient: 0.9, sunColor: 0xffffff, hemi: [0xdadee2, 0x5a5f66] },
  { name: 'Rainy', sky: 0x6f7c8a, fog: 0x8692a0, fogNear: 90, fogFar: 330, sun: 0.45, ambient: 0.8, sunColor: 0xd0d8e0, hemi: [0x8692a0, 0x454a52], rain: true },
];

export const BETS = [5, 10, 25, 50, 100];

/** Roll the randomized game-determining fields for a mode. */
export function rollGameParams(modeId, rng) {
  const m = MODES[modeId];
  let players;
  if (m.players.fixed) players = m.players.fixed;
  else if (m.players.options) players = rng.pick(m.players.options);
  else players = rng.int(m.players.min, m.players.max);
  let time = null;
  if (m.time) time = m.time.fixed ?? rng.pick(m.time.options);
  const winners = rng.pick(m.winners);
  const neighbourhood = rng.pick(NEIGHBOURHOODS);
  const weather = rng.pick(WEATHERS);
  let rounds = null, spotSchedule = null;
  if (modeId === 'chairs') {
    rounds = rng.pick([4, 5]);
    spotSchedule = rounds === 4 ? [12, 8, 4, 1] : rng.pick([[13, 10, 7, 4, 1], [12, 9, 6, 3, 1], [13, 9, 6, 3, 1]]);
  }
  return { mode: modeId, players, time, winners, neighbourhood, weather, rounds, spotSchedule, seed: rng.int(0, 2 ** 31) };
}

/**
 * Pre-determine the outcome before the game starts. Pure luck, fair odds:
 * every placement is equally likely (soccer: 50/50 by team).
 */
export function rollOutcome(params, bet, rng) {
  const { mode, players, winners } = params;
  const pot = bet * players;
  if (mode === 'soccer') {
    const win = rng.chance(0.5);
    const teamSize = players / 2;
    return { place: win ? 1 : 2, win, pot, prize: win ? pot / teamSize : 0, teamSize };
  }
  const place = rng.int(1, players);
  const share = winners[place - 1] || 0;
  let eliminatedRound = null;
  if (mode === 'chairs') {
    // place p (1 = winner). Survivors after round r = spotSchedule[r]; eliminated in the first round whose survivors < place
    const sched = params.spotSchedule;
    for (let r = 0; r < sched.length; r++) if (place > sched[r]) { eliminatedRound = r; break; }
  }
  return { place, win: share > 0, pot, prize: pot * share, eliminatedRound };
}
