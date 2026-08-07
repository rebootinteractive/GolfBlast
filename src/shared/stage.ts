export const STAGE_W = 393;
export const STAGE_H = 852;
export const DOT_R = 26;

// GameElement.color is `unknown` (open index signature); coerce safely.
export function coerceColor(value: unknown, fallback = 0xffffff): number {
  return typeof value === 'number' ? value : fallback;
}
