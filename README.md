# Meal Steel

**Play it:** https://arifialkov.github.io/meal-steel/

A 3D action betting game about suped-up food trucks. Pick a truck, place an entry bet, and square off against a lobby of simulated opponents in one of four modes. Runs in the browser on desktop and mobile and installs as a PWA.

## Modes

| Mode | Players | Time | Payout | Map |
| --- | --- | --- | --- | --- |
| Race | 4–8 | until the player finishes | podium split: 70/20/10, 50/35/15, 65/25/10 or 85/10/5 | non-loop Grand Prix through the neighbourhood with a chicane, a roundabout plaza and an overpass |
| Rumble | 5, 6, 8, 10 or 12 | 30, 90 or 180 s | winner takes all, or a 2–3 way split in bigger lobbies (75/25, 60/30/10, 50/30/20 …) | wrestling-ring square with jump ramps, destructibles, serving spots, coins and coupons |
| Soccer | 6, 8 or 10 (3v3 / 4v4 / 5v5) | 150 s | winning team splits the pot (2:1) | walled courtyard with goals at both ends |
| Musical Trucks | 14 (one of each truck) | 4–5 rounds | winner takes all | a paved venue (town square, parking lot, market square or paved park) with a ring of parking spots that shrinks every round |

Every match rolls its game-determining fields (players, time, payout) plus purely visual ones (neighbourhood, weather) and shows them in a slot-style roller while the lobby fills.

## Simulated multiplayer

There is no networking. Opponents are bots whose driving is meant to look like people. The result of every match is rolled before it starts with fair odds (every placement equally likely; soccer is 50/50) and the modes steer the simulation so the visuals land on that result:

- **Race** gives every bot a slot in a train around the player (a few metres per place ahead or behind). Early on bots wander widely around their slots, so places swap and the order looks open; the wander tightens as the race goes on, and somewhere between about 45% and 70% (random per match) the order settles, done by roughly 65-88%. Bots race properly: a little more power than their stats, quick cornering, turbo on the straights, a slipstream slingshot to pass, and a hidden catch-up when they are out of the camera's view behind the player. They pick the clearest lane to overtake in (scanning the trucks ahead in track coordinates and staying inside the measured road width), follow at racing distance when every lane is blocked, and bots that have to drop back move aside. The player's truck is never slowed. The result board is always the rolled order; in the rare case the physical crossing disagrees, the board still shows the rolled result.
- **Rumble** scales how many points each bot earns from its actions by how far it is from its target score trajectory, with a visible late surge and a final tally. Every truck has health: hits cost health by impact and weight (hits from the air hurt far more), being outside the ring drains it, and it slowly regenerates 15% after a few seconds without damage. A truck at zero is knocked out and ranked below every survivor, whatever its points; a hard aerial hit can flip a truck for an instant knockout. Knockouts are scheduled to fit the rolled result. Serving spots have a line of customers; a parked truck takes and hands out orders one by one. Smash the serving truck off its spot and the line panics (arms up, pants on fire); a fresh line pops back in once a truck holds the spot again.
- **Soccer** schedules the goals. Keepers deny every unscheduled shot (off the post), step aside for scheduled ones, and stoppage time runs until the result is in.
- **Musical Trucks** assigns spots to surviving bots, leaves one for the player when they survive, and sends a bumper after the player (contested spots cannot be secured) in the round they are slated to go out. Parking has a 15 second clock; when it runs out, every truck due to survive is towed into a free spot and the rest are out, so a round can never stall.

## Controls

- Desktop: WASD / arrows to drive, hold S while turning fast to drift, Shift for turbo (7 s recharge), Space (or E) for the truck's light special, Q for its heavy special. In soccer, C switches between ball cam and car cam. The HUD gauges show each key next to its meter.
- Rumble ramps: hit them with turbo for more air.
- Mobile: left joystick drives, right-side buttons for turbo, light special, heavy special and reverse; soccer has a camera button. Landscape only.

## Trucks

14 trucks: Bratzilla, Fryclone, Mac Attack, Burrito Bandito, Ramenator, Churricane, Hulk Hoagie, Cream Supreme, Supergyro, Eggatron, Wraptor, General Tsonami, Chief Beef and Barmaggeddon. See `src/data/trucks.js`.

### Special moves

Every truck has a light special (9–12 s recharge) and a heavy one (22–25 s recharge, more damage, bigger effects), from Bratzilla's grease dump and Glizzy Gun to Barmaggeddon's happy hour and bar fight. Moves animate the truck's own toppings (rigged out of the model by `src/vehicles/rig.js`): the sausage fires out of its bun, the fries launch as missiles, the burrito rolls off the roof, the cone swings round on its scoops to fire a laser, and so on.

- `src/vehicles/specials/moves.js`: the 28 moves.
- `src/vehicles/specials/system.js`: projectiles, hazards (puddles, clouds, obstacles), burning, and the bots' choice of when to fire.
- `src/vehicles/specials/assets.js`: the props (cooks, vats, cacti, drone kit, cheese cannon, egg turret, ...).
- `src/ui/splats.js`: windscreen splats when the player is hit.
- `src/core/sfx.js`: the moves' sound effects, synthesised in WebAudio (servos, pours, launches, explosions, gunfire, gas, glass, lasers, flame), panned and faded by distance from the camera.
- `src/fx/particles.js`: instanced particles; soft billboard puffs for smoke and clouds, and flame tongues stretched along their motion for fire.

Every hit goes through the mode's `onSpecialHit`, so the rolled result always stands. In Rumble a knock-over move only flips a truck that is due to go out; anyone else tumbles and lands on their wheels, and HP floors keep them alive.

### Truck models

All 14 trucks have textured models in `src/assets/trucks/<truck id>.fbx` (binary FBX with the textures embedded), picked up automatically; a truck without one (or whose model fails to load) falls back to a blocky built-in mesh. To add or replace models from Meshy-style exports (one folder per truck, named after the truck, holding the `*_texture.fbx` and its PNG maps):

```bash
node scripts/import-trucks.mjs <folder-of-truck-folders> [--only <truck id>]
```

When a model loads, `src/vehicles/rig.js` finds its wheels geometrically (contact patches on the ground, then a circle fit in the side view) and splits them into their own meshes, so wheels spin at road speed and the front pair steers, while the body rides on suspension springs (squat, dive, body roll, landings, kerbs and hits). Named moving parts are split out the same way by bounding box. `src/vehicles/truckfx.js` gives each truck its character: Ramenator's steaming bowl and swinging lanterns, General Tsonami's lanterns and fire-breathing dragon on boost, Fryclone's fries jiggling in their bucket, Wraptor's snapping jaw, Chief Beef's snorting skull, Cream Supreme's blaring megaphone, steam from exhaust stacks on braking and pulling away, and the regulars on Barmaggeddon's bar stools (chatting, drinking, and freaking out when the truck is hit).

The script turns each export into a compact FBX (about 700 KB): front rotated to face forward, scaled to the game's truck footprint, mesh welded, textures resized and embedded as JPEG, roughness and metallic packed into one map (it rides in the FBX's specular slot; `src/vehicles/models.js` turns it back into a PBR material). The game ships no `.glb` or `.webmanifest` files, for hosts that reject them: the models are FBX (`scripts/glb-to-fbx.mjs` converts any GLB) and the PWA manifest is `manifest.json`. Per-truck rotation or size overrides go in `scripts/truck-models.json`. Models are fetched on demand and cached by the service worker.

## City and props

Every map is generated fresh from the match seed, using the same art direction as the truck models:

- **Painted textures** (`src/world/citytex.js`): brick, stucco, siding, concrete and glass façades, storefronts, roofs, asphalt, paving, grass and awnings are painted on canvas once per session, each with a normal map for surface depth, a roughness map and a night-glow layer for lit windows and shop interiors. Walls are tinted per building, so one set of textures covers every neighbourhood palette.
- **Buildings** (`src/world/buildings.js`): style-driven masses with storefronts, shop signs and awnings, string courses, cornices and parapets, fire escapes, balconies, setback towers, pitched tile roofs, water towers, AC units, vents, stair bulkheads and rooftop billboards.
- **Streets** (`src/world/city.js`): textured asphalt, kerbs, storm drains, zebra crossings, manholes and patterned plazas.
- **Props** (`src/world/props.js`): every street prop is a detailed merged model (hydrants, mailboxes, lamp posts, benches, bins, trees, carts, planters, statue, fountain, cell tower), drawn with instancing.
- **Set pieces** (`src/world/setpieces.js`): the futsal arena (striped turf, full markings, sponsor boards, glass, goals with nets, a giant neon scoreboard), team flags and underglow for soccer, Rumble serving spots and jump ramps, Musical Trucks parking bays, and truss start and finish gantries. Serving queues live in `src/modes/serving.js`.

Pavements, plazas, lawn beds and the soccer turf are raised slightly; they are registered as ground pads so trucks ride on top of them. Rumble's jump ramps are solid from the sides and the back.

City geometry is merged into a few meshes per material and split into chunks, so the camera and shadow passes skip what they cannot see; props are culled per frame. If frames run slow, the game lowers its render resolution step by step and finally turns off shadows.

## Deployment

Every push to `main` or a `claude/**` branch runs `.github/workflows/pages.yml`, which builds the game and publishes `dist/` to the `gh-pages` branch, served by GitHub Pages at the URL above.

## Development

```bash
npm install
npm run dev      # dev server (LAN-visible, for phone testing)
npm run build    # icons + production build with service worker
npm run preview  # serve the production build
```

The bank is stored in `localStorage` and starts at $1,000. A broke player is refilled to $250 when returning to the menu.

## Layout

```
src/
  main.js            app state machine (menu → pregame → game → results)
  game.js            one match: scene, weather, camera, fixed-step physics loop
  core/              seeded RNG, math, input (keyboard + touch), procedural audio
  data/              truck roster, mode definitions, neighbourhoods, weather, outcome rolling
  world/             block plans, procedural city, props, colliders, race track
  vehicles/          truck mesh + arcade physics, special moves
  ai/                bot driver (steering, avoidance, stuck recovery)
  modes/             race, rumble, soccer, chairs (each with its outcome director)
  ui/                menu, pregame roller, HUD, results
  fx/                instanced particles
```

A debug hook is exposed as `window.__ms`; setting `__ms.game.autopilot = true` lets the mode drive the player's truck, which the headless smoke tests use.
