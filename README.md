# Meal Steel

**Play it:** https://arifialkov.github.io/meal-steel/

A 3D action betting game about suped-up food trucks. Pick a truck, place an entry bet, and square off against a lobby of simulated opponents in one of four modes. Runs in the browser on desktop and mobile and installs as a PWA.

## Modes

| Mode | Players | Time | Payout | Map |
| --- | --- | --- | --- | --- |
| Race | 4–8 | until the player finishes | podium split: 70/20/10, 50/35/15, 65/25/10 or 85/10/5 | non-loop Grand Prix through the neighbourhood with a chicane, a roundabout plaza and an overpass |
| Rumble | 12 | 30, 90 or 180 s | winner takes all | open square ringed by buildings, destructibles, serving spots, coins and coupons |
| Soccer | 6, 8 or 10 (3v3 / 4v4 / 5v5) | 150 s | winning team splits the pot (2:1) | walled courtyard with goals at both ends |
| Musical Trucks | 14 (one of each truck) | 4–5 rounds | winner takes all | park with a ring of parking spots that shrinks every round |

Every match rolls its game-determining fields (players, time, payout) plus purely visual ones (neighbourhood, weather) and shows them in a slot-style roller while the lobby fills.

## Simulated multiplayer

There is no networking. Opponents are bots whose driving is meant to look like people. The result of every match is rolled before it starts with fair odds (every placement equally likely; soccer is 50/50) and the modes steer the simulation so the visuals land on that result:

- **Race** paces bots relative to the player's track progress. Bots wander around the player early, converge toward their assigned finishing gap late, and bots slated behind can never cross the line first.
- **Rumble** scales how many points each bot earns from its actions by how far it is from its target score trajectory, with a visible late surge and a final tally.
- **Soccer** schedules the goals. Keepers deny every unscheduled shot (off the post), step aside for scheduled ones, and stoppage time runs until the result is in.
- **Musical Trucks** assigns spots to surviving bots, leaves one for the player when they survive, and sends a bumper after the player (contested spots cannot be secured) in the round they are slated to go out.

## Controls

- Desktop: WASD / arrows to drive, hold S while turning fast to drift, Shift for turbo (7 s recharge), Space for the truck's special move.
- Mobile: left joystick drives, right-side buttons for turbo, special and reverse. Landscape only.

## Trucks

14 trucks, each with a food-themed special move: Bratzilla, Fryclone, Mac Attack, Burrito Bandito, Ramenator, Churricane, Hulk Hoagie, Cream Supreme, Supergyro, Eggatron, Wraptor, General Tsonami, Chief Beef and Barmaggeddon. See `src/data/trucks.js`.

### Truck models

Textured models live in `src/assets/trucks/<truck id>.glb` and are picked up automatically; trucks without one fall back to a blocky built-in mesh. To add or replace models from Meshy-style exports (one folder per truck, named after the truck, holding the `*_texture.fbx` and its PNG maps):

```bash
node scripts/import-trucks.mjs <folder-of-truck-folders> [--only <truck id>]
```

The script turns each export into a compact GLB (about 450 KB): front rotated to face forward, scaled to the game's truck footprint, textures resized to WebP, roughness and metallic packed into one map. Per-truck rotation or size overrides go in `scripts/truck-models.json`. Models are fetched on demand and cached by the service worker.

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
