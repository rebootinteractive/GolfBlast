import { describe, it, expect } from 'vitest';
import { BUILTIN_LEVELS } from '../src/levels/builtin';
import { toSetup } from '../src/levels/golfLevel';
import { COLS, ROWS, stepDistance, type Cell } from '../src/game/grid';
import { createGame, legalMoves, playCard, type GolfState } from '../src/game/state';
import { PROTOTYPE } from '../src/config';

// ─── a competent-but-not-clairvoyant bot ────────────────────────────────────
// Plans the whole hand it can see, exactly like a thinking player, but never
// looks at cards it hasn't been dealt. Used to keep par honest: if the bot can't
// finish a level often enough, a human won't either.

const WIN = -1e6;

function scorePosition(state: GolfState): number {
  if (state.status === 'won') return WIN;
  if (state.status === 'lost') return 1e6;
  const d = stepDistance(state.ball, state.hole);
  // Lined up with a clear shot home is by far the best place to be parked.
  if (legalMoves(state, d).some((m) => m.sinks)) return -100 + d;
  const dx = Math.abs(state.ball.gx - state.hole.gx);
  const dy = Math.abs(state.ball.gy - state.hole.gy);
  const aligned = dx === 0 || dy === 0 || dx === dy;
  // Staying within one card's reach of the hole matters more than raw distance.
  const reachPenalty = d > 8 ? (d - 8) * 2 : 0;
  return d + reachPenalty + (aligned ? 0 : 6);
}

interface Plan {
  score: number;
  first?: { index: number; target: Cell };
}

/**
 * Best line of play through the cards currently in hand. `depth` is exactly the
 * number of cards held when planning started, so the search stops the moment the
 * hand runs out — the bot never peeks at a deal it hasn't earned.
 */
function planHand(state: GolfState, depth: number, first?: Plan['first']): Plan {
  if (depth === 0 || state.status !== 'playing' || state.hand.length === 0) {
    return { score: scorePosition(state), first };
  }
  let best: Plan = { score: Infinity, first };
  for (let i = 0; i < state.hand.length; i++) {
    for (const move of legalMoves(state, state.hand[i])) {
      const next = playCard(state, i, move.target);
      if (!next) continue;
      const choice = first ?? { index: i, target: move.target };
      const plan = next.status === 'won'
        ? { score: WIN, first: choice }
        : planHand(next, depth - 1, choice);
      if (plan.score < best.score) best = plan;
    }
  }
  return best;
}

/** Two cards of lookahead — deeper search is slower without playing much better. */
const LOOKAHEAD = 2;

function playOut(state: GolfState): GolfState {
  let s = state;
  let guard = 0;
  while (s.status === 'playing' && guard++ < 200) {
    const plan = planHand(s, Math.min(s.hand.length, LOOKAHEAD));
    if (!plan.first) break;
    const next = playCard(s, plan.first.index, plan.first.target);
    if (!next) break;
    s = next;
  }
  return s;
}

function winRate(level: (typeof BUILTIN_LEVELS)[number], seeds: number): number {
  const setup = toSetup(level);
  let wins = 0;
  for (let seed = 0; seed < seeds; seed++) {
    if (playOut(createGame(setup, seed)).status === 'won') wins++;
  }
  return wins / seeds;
}

describe('builtin levels', () => {
  it('all share the prototype namespace and unique ids', () => {
    const ids = BUILTIN_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BUILTIN_LEVELS.every((l) => l.prototype === PROTOTYPE)).toBe(true);
  });

  it('each has exactly one ball and one hole inside the grid', () => {
    for (const level of BUILTIN_LEVELS) {
      expect(level.elements.filter((e) => e.type === 'ball')).toHaveLength(1);
      expect(level.elements.filter((e) => e.type === 'hole')).toHaveLength(1);
      const setup = toSetup(level);
      for (const c of [setup.ball, setup.hole, ...setup.blocked]) {
        expect(c.gx).toBeGreaterThanOrEqual(0);
        expect(c.gx).toBeLessThan(COLS);
        expect(c.gy).toBeGreaterThanOrEqual(0);
        expect(c.gy).toBeLessThan(ROWS);
      }
    }
  });

  it('never places the hole or ball on a blocked dot', () => {
    for (const level of BUILTIN_LEVELS) {
      const setup = toSetup(level);
      const blockedKeys = new Set(setup.blocked.map((c) => `${c.gx},${c.gy}`));
      expect(blockedKeys.has(`${setup.ball.gx},${setup.ball.gy}`)).toBe(false);
      expect(blockedKeys.has(`${setup.hole.gx},${setup.hole.gy}`)).toBe(false);
    }
  });

  it('is winnable at par by the bot on most deals', () => {
    for (const level of BUILTIN_LEVELS) {
      const rate = winRate(level, 60);
      expect.soft(rate, `${level.name} (${toSetup(level).cards} cards) win rate ${rate}`).toBeGreaterThan(0.7);
    }
  });

  it('opens with a gentle tutorial level', () => {
    const first = toSetup(BUILTIN_LEVELS[0]);
    expect(first.blocked).toHaveLength(0);
    expect(stepDistance(first.ball, first.hole)).toBeLessThanOrEqual(4);
  });
});
