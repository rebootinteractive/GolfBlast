import { describe, it, expect } from 'vitest';
import { COLS, ROWS, DIRECTIONS, inBounds, key, unkey, pathCells, stepDistance } from '../src/game/grid';

describe('grid geometry', () => {
  it('has eight travel directions', () => {
    expect(DIRECTIONS).toHaveLength(8);
    const unique = new Set(DIRECTIONS.map((d) => `${d.gx},${d.gy}`));
    expect(unique.size).toBe(8);
  });

  it('round-trips cell keys', () => {
    for (const c of [{ gx: 0, gy: 0 }, { gx: COLS - 1, gy: ROWS - 1 }, { gx: 5, gy: 11 }]) {
      expect(unkey(key(c.gx, c.gy))).toEqual(c);
    }
  });

  it('bounds-checks cells', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(COLS - 1, ROWS - 1)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(COLS, 0)).toBe(false);
    expect(inBounds(0, ROWS)).toBe(false);
  });

  it('counts a diagonal step the same as an orthogonal one', () => {
    expect(stepDistance({ gx: 0, gy: 0 }, { gx: 3, gy: 0 })).toBe(3);
    expect(stepDistance({ gx: 0, gy: 0 }, { gx: 3, gy: 3 })).toBe(3);
    expect(stepDistance({ gx: 0, gy: 0 }, { gx: 3, gy: 1 })).toBe(3);
  });
});

describe('pathCells', () => {
  it('returns every touched cell, landing cell last', () => {
    const path = pathCells({ gx: 2, gy: 2 }, { gx: 1, gy: 0 }, 3);
    expect(path).toEqual([{ gx: 3, gy: 2 }, { gx: 4, gy: 2 }, { gx: 5, gy: 2 }]);
  });

  it('walks diagonals one cell per step', () => {
    const path = pathCells({ gx: 0, gy: 0 }, { gx: 1, gy: 1 }, 2);
    expect(path).toEqual([{ gx: 1, gy: 1 }, { gx: 2, gy: 2 }]);
  });

  it('refuses to leave the board', () => {
    expect(pathCells({ gx: 1, gy: 1 }, { gx: -1, gy: 0 }, 2)).toBeNull();
    expect(pathCells({ gx: COLS - 1, gy: 0 }, { gx: 1, gy: 0 }, 1)).toBeNull();
  });
});
