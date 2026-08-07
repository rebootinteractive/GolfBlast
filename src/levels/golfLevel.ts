// Bridges the generic LevelData contract to GolfBlast's grid.
//
// Levels are authored as ASCII maps — one character per dot, COLS wide and
// ROWS tall — then flattened into normalized elements so they round-trip
// through the store (and, later, the editor) unchanged.

import type { GameElement, LevelData } from '../shared/types';
import type { LevelSetup } from '../game/state';
import { COLS, ROWS, type Cell } from '../game/grid';

export type GolfElementType = 'ball' | 'hole' | 'blocked';

const CHAR_TO_TYPE: Record<string, GolfElementType> = {
  O: 'ball',
  H: 'hole',
  '#': 'blocked',
};

export function toNormalized(gx: number, gy: number): { x: number; y: number } {
  return { x: gx / (COLS - 1), y: gy / (ROWS - 1) };
}

export function element(type: GolfElementType, gx: number, gy: number): GameElement {
  return { type, gx, gy, ...toNormalized(gx, gy) };
}

/** gx/gy are authoritative; x/y are the normalized mirror for the generic contract. */
function cellOf(el: GameElement): Cell {
  const gx = typeof el.gx === 'number' ? el.gx : Math.round(el.x * (COLS - 1));
  const gy = typeof el.gy === 'number' ? el.gy : Math.round(el.y * (ROWS - 1));
  return { gx, gy };
}

export function parseMap(rows: readonly string[]): GameElement[] {
  if (rows.length !== ROWS) {
    throw new Error(`level map must be ${ROWS} rows, got ${rows.length}`);
  }
  const out: GameElement[] = [];
  rows.forEach((row, gy) => {
    if (row.length !== COLS) {
      throw new Error(`level map row ${gy} must be ${COLS} chars, got ${row.length}`);
    }
    [...row].forEach((ch, gx) => {
      const type = CHAR_TO_TYPE[ch];
      if (type) out.push(element(type, gx, gy));
    });
  });
  return out;
}

function metaNumber(level: LevelData, field: string, fallback: number): number {
  const value = level.meta?.[field];
  return typeof value === 'number' ? value : fallback;
}

/** Throws when a level is missing its ball or hole — caught at load, not mid-play. */
export function toSetup(level: LevelData): LevelSetup {
  let ball: Cell | undefined;
  let hole: Cell | undefined;
  const blocked: Cell[] = [];

  for (const el of level.elements) {
    const c = cellOf(el);
    if (el.type === 'ball') ball = c;
    else if (el.type === 'hole') hole = c;
    else if (el.type === 'blocked') blocked.push(c);
  }

  if (!ball) throw new Error(`level "${level.id}" has no ball`);
  if (!hole) throw new Error(`level "${level.id}" has no hole`);
  return {
    ball,
    hole,
    blocked,
    cards: metaNumber(level, 'cards', 20),
    par: metaNumber(level, 'par', 8),
  };
}
