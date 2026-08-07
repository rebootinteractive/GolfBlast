// GolfBlast rules engine. Pure TypeScript — no Pixi, no DOM, no globals.
// Every transition returns a new state object, which makes undo a plain stack.

import type { Cell } from './grid';
import {
  DIRECTIONS, HAND_SIZE, MAX_CARD, MIN_CARD,
  inBounds, key, pathCells, sameCell,
} from './grid';

export interface Segment {
  from: Cell;
  to: Cell;
}

export type LostReason = 'out-of-cards' | 'boxed-in';

export interface GolfState {
  readonly ball: Cell;
  readonly hole: Cell;
  /** Dots blocked by the level author. Never changes during play. */
  readonly blocked: ReadonlySet<number>;
  /** Dots consumed by ink — landed on or flown over. Grows every move. */
  readonly spent: ReadonlySet<number>;
  readonly hand: readonly number[];
  /** Cards still undealt in the pool. */
  readonly cardsRemaining: number;
  /** Target stroke count for this level — the score to beat, not a limit. */
  readonly par: number;
  readonly trail: readonly Segment[];
  readonly rng: number;
  readonly status: 'playing' | 'won' | 'lost';
  readonly lostReason?: LostReason;
  /** Cards actually played (the score). */
  readonly strokes: number;
  /** Cards thrown away because no card in hand could be played. */
  readonly burned: number;
}

export interface Move {
  readonly distance: number;
  readonly dir: Cell;
  /** Cells touched, nearest first; the last one is where the ball lands. */
  readonly path: readonly Cell[];
  readonly target: Cell;
  readonly sinks: boolean;
}

export interface LevelSetup {
  ball: Cell;
  hole: Cell;
  blocked: Cell[];
  /** Size of the card pool — the hard limit. Run out and the level is lost. */
  cards: number;
  /** Target stroke count — the score to beat. */
  par: number;
}

// ─── deterministic RNG (mulberry32) ──────────────────────────────────────────
// Threaded through state so undo restores the exact same upcoming cards —
// you cannot undo your way to a better hand.

function nextUint(seed: number): number {
  return (seed + 0x6d2b79f5) >>> 0;
}

function randomFloat(seed: number): number {
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns [nextSeed, integer in [lo, hi]]. */
function randomInt(seed: number, lo: number, hi: number): [number, number] {
  const s = nextUint(seed);
  return [s, lo + Math.floor(randomFloat(s) * (hi - lo + 1))];
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── queries ─────────────────────────────────────────────────────────────────

/** A dot the ball may fly over: on the board, unspent, unblocked, not the hole. */
function isPassable(state: GolfState, c: Cell): boolean {
  if (!inBounds(c.gx, c.gy)) return false;
  const k = key(c.gx, c.gy);
  if (state.blocked.has(k) || state.spent.has(k)) return false;
  return !sameCell(c, state.hole);
}

/** A dot the ball may come to rest on. The hole always qualifies. */
function isLandable(state: GolfState, c: Cell): boolean {
  if (!inBounds(c.gx, c.gy)) return false;
  if (sameCell(c, state.hole)) return true;
  const k = key(c.gx, c.gy);
  return !state.blocked.has(k) && !state.spent.has(k);
}

/** Every legal landing for a card of this face value, one per direction at most. */
export function legalMoves(state: GolfState, distance: number): Move[] {
  if (state.status !== 'playing') return [];
  const moves: Move[] = [];
  for (const dir of DIRECTIONS) {
    const path = pathCells(state.ball, dir, distance);
    if (!path) continue;
    const target = path[path.length - 1];
    const clear = path.every((c, i) => (i === path.length - 1 ? isLandable(state, c) : isPassable(state, c)));
    if (!clear) continue;
    moves.push({ distance, dir, path, target, sinks: sameCell(target, state.hole) });
  }
  return moves;
}

/** Face values that currently have at least one legal landing. */
export function playableDistances(state: GolfState): number[] {
  const out: number[] = [];
  for (let d = MIN_CARD; d <= MAX_CARD; d++) {
    if (legalMoves(state, d).length > 0) out.push(d);
  }
  return out;
}

export function handHasPlay(state: GolfState): boolean {
  return state.hand.some((d) => legalMoves(state, d).length > 0);
}

/** Cards the player still has access to: in hand plus undealt. */
export function cardsLeft(state: GolfState): number {
  return state.hand.length + state.cardsRemaining;
}

// ─── transitions ─────────────────────────────────────────────────────────────

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type Draft = Mutable<Omit<GolfState, 'spent' | 'hand' | 'trail'>> & {
  spent: Set<number>;
  hand: number[];
  trail: Segment[];
};

function toDraft(s: GolfState): Draft {
  return { ...s, spent: new Set(s.spent), hand: [...s.hand], trail: [...s.trail] };
}

/**
 * Fill the hand from the pool, guaranteeing at least one playable card whenever
 * the board offers any play at all. If nothing is playable from any distance the
 * ball is walled in and the level is lost.
 */
function dealHand(draft: Draft): void {
  if (draft.status !== 'playing') return;

  const playable = playableDistances(draft);
  if (playable.length === 0) {
    draft.status = 'lost';
    draft.lostReason = 'boxed-in';
    return;
  }
  if (draft.cardsRemaining <= 0) {
    draft.status = 'lost';
    draft.lostReason = 'out-of-cards';
    return;
  }

  const count = Math.min(HAND_SIZE, draft.cardsRemaining);
  const hand: number[] = [];
  for (let i = 0; i < count; i++) {
    const [seed, value] = randomInt(draft.rng, MIN_CARD, MAX_CARD);
    draft.rng = seed;
    hand.push(value);
  }

  // Guarantee: no hand ever arrives dead.
  if (!hand.some((d) => playable.includes(d))) {
    const [seed1, slot] = randomInt(draft.rng, 0, hand.length - 1);
    const [seed2, pick] = randomInt(seed1, 0, playable.length - 1);
    draft.rng = seed2;
    hand[slot] = playable[pick];
  }

  draft.hand = hand;
  draft.cardsRemaining -= count;
}

/**
 * A hand with no legal play is thrown away and replaced. The discarded cards are
 * gone for good, so being stuck still costs you — it just isn't instant death.
 */
function resolveHand(draft: Draft): void {
  let guard = 0;
  while (draft.status === 'playing' && (draft.hand.length === 0 || !handHasPlay(draft))) {
    if (guard++ > 64) break;
    draft.burned += draft.hand.length;
    draft.hand = [];
    dealHand(draft);
  }
}

export function createGame(setup: LevelSetup, seed: number): GolfState {
  const start: GolfState = {
    ball: setup.ball,
    hole: setup.hole,
    blocked: new Set(setup.blocked.map((c) => key(c.gx, c.gy))),
    // The ball's starting dot is spent from the very first move.
    spent: new Set([key(setup.ball.gx, setup.ball.gy)]),
    hand: [],
    cardsRemaining: setup.cards,
    par: setup.par,
    trail: [],
    rng: seed >>> 0,
    status: 'playing',
    strokes: 0,
    burned: 0,
  };
  const draft = toDraft(start);
  resolveHand(draft);
  return draft;
}

/** Play the card at `handIndex` onto `target`. Returns null if that isn't legal. */
export function playCard(state: GolfState, handIndex: number, target: Cell): GolfState | null {
  if (state.status !== 'playing') return null;
  const distance = state.hand[handIndex];
  if (distance === undefined) return null;
  const move = legalMoves(state, distance).find((m) => sameCell(m.target, target));
  if (!move) return null;

  const draft = toDraft(state);
  // Every dot the line touched is consumed, landing dot included.
  for (const c of move.path) draft.spent.add(key(c.gx, c.gy));
  draft.trail.push({ from: state.ball, to: move.target });
  draft.ball = move.target;
  draft.hand.splice(handIndex, 1);
  draft.strokes += 1;

  if (move.sinks) {
    draft.status = 'won';
    return draft;
  }
  resolveHand(draft);
  return draft;
}
