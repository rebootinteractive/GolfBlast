import { describe, it, expect } from 'vitest';
import { COLS, ROWS, key, type Cell } from '../src/game/grid';
import {
  createGame, legalMoves, playCard, playableDistances, handHasPlay, cardsLeft,
  type GolfState, type LevelSetup,
} from '../src/game/state';

const SEED = 12345;

function setup(over: Partial<LevelSetup> = {}): LevelSetup {
  return { ball: { gx: 0, gy: 0 }, hole: { gx: 15, gy: 19 }, blocked: [], cards: 20, par: 6, ...over };
}

/** Force a specific hand so tests don't depend on the deal. */
function withHand(state: GolfState, hand: number[]): GolfState {
  return { ...state, hand };
}

describe('createGame', () => {
  it('spends the ball\'s starting dot immediately', () => {
    const s = createGame(setup(), SEED);
    expect(s.spent.has(key(0, 0))).toBe(true);
    expect(s.spent.size).toBe(1);
  });

  it('deals a hand that always contains a playable card', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createGame(setup(), seed);
      expect(s.status).toBe('playing');
      expect(handHasPlay(s)).toBe(true);
    }
  });

  it('draws the opening hand out of the card pool', () => {
    const s = createGame(setup({ cards: 20 }), SEED);
    expect(cardsLeft(s)).toBe(20);
    expect(s.hand).toHaveLength(3);
    expect(s.cardsRemaining).toBe(17);
  });
});

describe('legal moves', () => {
  it('offers at most one landing per direction', () => {
    const s = createGame(setup({ ball: { gx: 8, gy: 10 } }), SEED);
    const moves = legalMoves(s, 3);
    expect(moves).toHaveLength(8);
    expect(new Set(moves.map((m) => `${m.target.gx},${m.target.gy}`)).size).toBe(8);
  });

  it('will not run off the board', () => {
    const s = createGame(setup({ ball: { gx: 0, gy: 0 } }), SEED);
    const moves = legalMoves(s, 3);
    expect(moves.every((m) => m.target.gx >= 0 && m.target.gy >= 0)).toBe(true);
    expect(moves).toHaveLength(3); // right, down, down-right
  });

  it('cannot pass through a blocked dot', () => {
    const s = createGame(setup({ ball: { gx: 0, gy: 0 }, blocked: [{ gx: 2, gy: 0 }] }), SEED);
    expect(legalMoves(s, 4).some((m) => m.dir.gx === 1 && m.dir.gy === 0)).toBe(false);
    expect(legalMoves(s, 1).some((m) => m.dir.gx === 1 && m.dir.gy === 0)).toBe(true);
  });

  it('cannot land on a blocked dot', () => {
    const s = createGame(setup({ ball: { gx: 0, gy: 0 }, blocked: [{ gx: 3, gy: 0 }] }), SEED);
    expect(legalMoves(s, 3).some((m) => m.dir.gx === 1 && m.dir.gy === 0)).toBe(false);
  });
});

describe('the hole is solid', () => {
  const s = createGame(setup({ ball: { gx: 0, gy: 0 }, hole: { gx: 2, gy: 0 } }), SEED);

  it('blocks a line that would fly over it', () => {
    expect(legalMoves(s, 4).some((m) => m.dir.gx === 1 && m.dir.gy === 0)).toBe(false);
  });

  it('accepts a line that lands exactly on it', () => {
    const sink = legalMoves(s, 2).find((m) => m.dir.gx === 1 && m.dir.gy === 0);
    expect(sink?.sinks).toBe(true);
  });

  it('wins the level when the ball lands on it', () => {
    const next = playCard(withHand(s, [2]), 0, { gx: 2, gy: 0 });
    expect(next?.status).toBe('won');
    expect(next?.strokes).toBe(1);
  });
});

describe('ink consumes every dot the line touches', () => {
  const start = withHand(createGame(setup({ ball: { gx: 0, gy: 0 } }), SEED), [3]);
  const after = playCard(start, 0, { gx: 3, gy: 0 })!;

  it('spends the flown-over dots and the landing dot', () => {
    for (const gx of [0, 1, 2, 3]) expect(after.spent.has(key(gx, 0))).toBe(true);
    expect(after.spent.has(key(4, 0))).toBe(false);
    expect(after.ball).toEqual({ gx: 3, gy: 0 });
  });

  it('records the segment for drawing', () => {
    expect(after.trail).toEqual([{ from: { gx: 0, gy: 0 }, to: { gx: 3, gy: 0 } }]);
  });

  it('refuses to let anything stop on one of those dots again', () => {
    const back = withHand(after, [2]);
    // (1,0) is spent, so a 2 travelling left has nowhere to land
    expect(legalMoves(back, 2).some((m) => m.dir.gx === -1 && m.dir.gy === 0)).toBe(false);
  });

  it('leaves the original state untouched', () => {
    expect(start.spent.size).toBe(1);
    expect(start.ball).toEqual({ gx: 0, gy: 0 });
    expect(start.trail).toHaveLength(0);
  });
});

describe('lines are not walls — only dots are consumed', () => {
  // Ink a down-right diagonal (4,4) → (6,6), touching (4,4) (5,5) (6,6).
  const inked = playCard(
    withHand(createGame(setup({ ball: { gx: 4, gy: 4 } }), SEED), [2]),
    0, { gx: 6, gy: 6 },
  )!;

  it('lets an opposite diagonal cross it between the dots', () => {
    // (4,5) → (6,3) crosses the old line at (4.5, 4.5) — no dot there, so it is
    // legal. This is the one case where two lines meet off-lattice, and it is
    // exactly what would be forbidden if ink were a wall.
    const crosser = withHand({ ...inked, ball: { gx: 4, gy: 5 } }, [2]);
    const move = legalMoves(crosser, 2).find((m) => m.dir.gx === 1 && m.dir.gy === -1);
    expect(move?.target).toEqual({ gx: 6, gy: 3 });
    expect(playCard(crosser, 0, { gx: 6, gy: 3 })).not.toBeNull();
  });

  it('flies over a used dot but refuses to stop on one', () => {
    const over = withHand({ ...inked, ball: { gx: 5, gy: 3 } }, [3]);
    // (5,3) → (5,6) passes through (5,5), which the old line spent. Allowed:
    // ink does not block flight, and the landing dot (5,6) is free.
    expect(legalMoves(over, 3).some((m) => m.dir.gx === 0 && m.dir.gy === 1)).toBe(true);

    // (5,3) → (5,5) would come to rest on that spent dot. Refused.
    const onto = withHand({ ...inked, ball: { gx: 5, gy: 3 } }, [2]);
    expect(legalMoves(onto, 2).some((m) => m.dir.gx === 0 && m.dir.gy === 1)).toBe(false);
  });
});

describe('illegal plays are rejected', () => {
  const s = withHand(createGame(setup({ ball: { gx: 5, gy: 5 } }), SEED), [3]);

  it('rejects a target at the wrong distance', () => {
    expect(playCard(s, 0, { gx: 9, gy: 5 })).toBeNull();
  });

  it('rejects an off-line target', () => {
    expect(playCard(s, 0, { gx: 8, gy: 6 })).toBeNull();
  });

  it('rejects an empty hand slot', () => {
    expect(playCard(s, 2, { gx: 8, gy: 5 })).toBeNull();
  });
});

/** Every cell at exactly `radius` steps from `c`, clipped to the board. */
function ring(c: Cell, radius: number): Cell[] {
  const out: Cell[] = [];
  for (let gx = c.gx - radius; gx <= c.gx + radius; gx++) {
    for (let gy = c.gy - radius; gy <= c.gy + radius; gy++) {
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
      if (Math.max(Math.abs(gx - c.gx), Math.abs(gy - c.gy)) === radius) out.push({ gx, gy });
    }
  }
  return out;
}

describe('reach is limited by the nearest obstruction on each ray', () => {
  const ball: Cell = { gx: 8, gy: 10 };

  it('leaves the distances short of the ring playable and kills the rest', () => {
    const s = createGame({ ball, hole: { gx: 0, gy: 0 }, blocked: ring(ball, 3), cards: 30, par: 6 }, SEED);
    expect(playableDistances(s)).toEqual([1, 2]);
  });

  it('always deals a hand that can be played inside that reach', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = createGame({ ball, hole: { gx: 0, gy: 0 }, blocked: ring(ball, 3), cards: 30, par: 6 }, seed);
      expect(s.status).toBe('playing');
      expect(s.hand.some((d) => d <= 2)).toBe(true);
    }
  });
});

describe('losing', () => {
  it('is boxed-in when every neighbouring dot is dead', () => {
    const ball: Cell = { gx: 8, gy: 10 };
    const s = createGame({ ball, hole: { gx: 0, gy: 0 }, blocked: ring(ball, 1), cards: 20, par: 6 }, SEED);
    expect(playableDistances(s)).toEqual([]);
    expect(s.status).toBe('lost');
    expect(s.lostReason).toBe('boxed-in');
  });

  it('is out-of-cards when the pool empties without a sink', () => {
    const s = createGame(setup({ cards: 1 }), SEED);
    expect(s.hand).toHaveLength(1);
    const target = legalMoves(s, s.hand[0])[0].target;
    const after = playCard(s, 0, target)!;
    expect(after.status).toBe('lost');
    expect(after.lostReason).toBe('out-of-cards');
  });
});

describe('a dead hand is discarded, not fatal', () => {
  it('burns the unplayable cards and deals again', () => {
    const ball: Cell = { gx: 8, gy: 10 };
    const s = createGame({ ball, hole: { gx: 0, gy: 0 }, blocked: ring(ball, 2), cards: 30, par: 6 }, 7);
    expect(playableDistances(s)).toEqual([1]);
    // Whatever came out of the pool, the player is left with a playable hand
    // and every card is still accounted for.
    expect(handHasPlay(s)).toBe(true);
    expect(s.status).toBe('playing');
    expect(cardsLeft(s) + s.burned).toBe(30);
  });
});
