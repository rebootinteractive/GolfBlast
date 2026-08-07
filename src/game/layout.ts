// Fixed stage layout — mirrors composition.html. The board never moves.

import { COLS, ROWS } from './grid';
import { STAGE_W, STAGE_H } from '../shared/stage';

export const SPACING = 24;
export const BOARD_W = (COLS - 1) * SPACING;
export const BOARD_H = (ROWS - 1) * SPACING;
export const BOARD_LEFT = Math.round((STAGE_W - BOARD_W) / 2);
export const BOARD_TOP = 96;
export const BOARD_BOTTOM = BOARD_TOP + BOARD_H;

export const STATUS_Y = BOARD_BOTTOM + 26;

export const CARD_W = 96;
export const CARD_H = 118;
export const CARD_GAP = 14;
export const HAND_TOP = BOARD_BOTTOM + 62;
export const HAND_LEFT = Math.round((STAGE_W - (3 * CARD_W + 2 * CARD_GAP)) / 2);
export const HAND_BOTTOM = HAND_TOP + CARD_H;

/** How close a finger has to get to a highlighted dot for it to take the drop. */
export const SNAP_RADIUS = 30;

export function dotX(gx: number): number {
  return BOARD_LEFT + gx * SPACING;
}

export function dotY(gy: number): number {
  return BOARD_TOP + gy * SPACING;
}

export function cardX(slot: number): number {
  return HAND_LEFT + slot * (CARD_W + CARD_GAP);
}

/** Nearest grid cell to a stage point, unclamped — callers validate it. */
export function cellAt(x: number, y: number): { gx: number; gy: number } {
  return {
    gx: Math.round((x - BOARD_LEFT) / SPACING),
    gy: Math.round((y - BOARD_TOP) / SPACING),
  };
}

export const COLORS = {
  paper: 0xf3eee3,
  dotLive: 0x9b9282,
  dotSpent: 0xdbd4c6,
  blocked: 0x6f6455,
  ink: 0x27406b,
  ball: 0xd6402c,
  hole: 0x1d7a4c,
  highlight: 0x2f7ed0,
  card: 0xffffff,
  cardEdge: 0xd9d1c1,
  text: 0x3a3428,
  textDim: 0x8d8676,
} as const;

export const STAGE = { width: STAGE_W, height: STAGE_H };
