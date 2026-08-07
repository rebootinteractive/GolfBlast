# GolfBlast

Grid golf. A hand of three number cards, eight directions, and a hole you have to
land on **exactly** — while every line you draw kills the dots it touches, so the
board closes as you play.

Vite + TypeScript + PixiJS. Cloned from `reboot-prototype-starter`.

## The rules

- The board is a fixed **16 × 20 lattice of dots**. One dot is the ball, one is the hole.
- A card's number is a **distance in steps**. A diagonal step counts the same as a
  straight one, so a `3` reaches any of the (up to) eight dots three steps away.
- Playing a card **spends every dot the line touches** — the landing dot and each dot
  flown over. A spent dot can never be **landed on** again, but lines fly over each
  other freely: ink occupies dots, it is not a wall. What runs out is places to stop.
- The **hole is solid**. A line may end on it (you win) but never pass over it.
- Blocked dots are placed by the level. Unlike ink these are solid — they stop a line
  mid-flight, the same way the hole does.
- **par** is the stroke count to beat. **cards** is the size of the pool the level
  deals from — run it dry without sinking and you lose.
- Every deal is checked against the live board, so a hand never arrives with nothing
  playable. A hand that goes dead mid-play is discarded and replaced, and the lost
  cards come out of the pool.
- If no distance has a free landing anywhere you're **boxed in**. See below — this is
  now rare.

## What closes the board

Only level obstacles and the hole block flight, so you can always travel — what you
lose is somewhere to land. As ink accumulates, a card is dead when all eight dots at
its exact distance are already spent, which hits big numbers and small ones alike.

Being **boxed in** (no distance has a free landing anywhere) is still a loss condition,
but under this rule it is close to unreachable in practice; losses are almost entirely
running the card pool dry.

## Layout

`src/game/`
- `grid.ts` — lattice geometry, the eight directions, step distance. Pure data.
- `state.ts` — the whole rules engine. No Pixi, no DOM. Every transition returns a new
  state, which is why undo is just a stack.
- `layout.ts` — the fixed stage. Mirrors `composition.html`.
- `GameApp.ts` — PixiJS rendering and input.

`src/levels/`
- `builtin.ts` — levels as ASCII maps (`O` ball, `H` hole, `#` blocked).
- `golfLevel.ts` — maps ↔ the generic `LevelData` contract.

## Authoring a level

Edit the ASCII map in `src/levels/builtin.ts` — 16 characters wide, 20 rows tall — then
set `par` and `cards`. Run `npm test`: a bot plays every level 60 times from different
deals and fails the build if it can't finish reliably, so a level that's impossible or
starved of cards won't ship.

## Not built yet

The in-game level editor and the Supabase live-levels path are deliberately switched
off for v1 — the point of this build is to find out whether the core loop is fun on a
bare board. `LevelStore` and the Supabase backend are still wired up, so restoring
`EditorApp.ts` from the starter is all it takes to bring authoring back.

## Commands

- `npm run dev` — local dev
- `npm test` — rules engine + level solvability
- `npm run build` — type-check + production build
