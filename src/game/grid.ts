// Grid geometry for GolfBlast. Pure data — no Pixi, no DOM.
//
// The board is a lattice of dots. A move travels `distance` steps along one of
// eight straight lines. Diagonal steps count the same as orthogonal ones, so a
// "3" is three steps in any of the eight directions.

export const COLS = 16;
export const ROWS = 20;

/** Card face values that can be dealt. */
export const MIN_CARD = 1;
export const MAX_CARD = 8;

/** Cards held at once. */
export const HAND_SIZE = 3;

export interface Cell {
  gx: number;
  gy: number;
}

export const DIRECTIONS: ReadonlyArray<Cell> = [
  { gx: 1, gy: 0 },
  { gx: -1, gy: 0 },
  { gx: 0, gy: 1 },
  { gx: 0, gy: -1 },
  { gx: 1, gy: 1 },
  { gx: 1, gy: -1 },
  { gx: -1, gy: 1 },
  { gx: -1, gy: -1 },
];

export function key(gx: number, gy: number): number {
  return gy * COLS + gx;
}

export function unkey(k: number): Cell {
  return { gx: k % COLS, gy: Math.floor(k / COLS) };
}

export function inBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.gx === b.gx && a.gy === b.gy;
}

/** Chebyshev distance — the number of 8-directional steps between two cells. */
export function stepDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
}

/**
 * The cells a move touches, nearest first, excluding the origin.
 * Length always equals `distance`; the last entry is the landing cell.
 * Returns null if the line would leave the board.
 */
export function pathCells(from: Cell, dir: Cell, distance: number): Cell[] | null {
  const out: Cell[] = [];
  for (let step = 1; step <= distance; step++) {
    const gx = from.gx + dir.gx * step;
    const gy = from.gy + dir.gy * step;
    if (!inBounds(gx, gy)) return null;
    out.push({ gx, gy });
  }
  return out;
}
