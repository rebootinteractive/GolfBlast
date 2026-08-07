import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { LevelData } from '../shared/types';
import { STAGE_W, STAGE_H } from '../shared/stage';
import { COLS, ROWS, key, type Cell } from './grid';
import {
  createGame, legalMoves, playCard, cardsLeft, seedFrom,
  type GolfState, type LevelSetup, type Move,
} from './state';
import { toSetup } from '../levels/golfLevel';
import {
  CARD_H, CARD_W, COLORS, HAND_BOTTOM, HAND_TOP,
  SNAP_RADIUS, STATUS_Y, cardX, cellAt, dotX, dotY,
} from './layout';

export interface GameOptions {
  level: LevelData;
  onMenu: () => void;
  onWin?: () => void;
  onNext?: () => void;
}

const MOVE_MS = 190;

interface MoveAnim {
  from: Cell;
  to: Cell;
  elapsed: number;
  after: GolfState;
}

export class GameApp {
  private app = new Application();
  private root = new Container();

  private dotLayer = new Container();
  private inkLayer = new Graphics();
  private flightLayer = new Graphics();
  private markerLayer = new Container();
  private hintLayer = new Container();
  private handLayer = new Container();
  private hudLayer = new Container();

  private dots: Graphics[] = [];
  private cards: Container[] = [];
  private hints: Graphics[] = [];
  private ballView = new Graphics();
  private holeView = new Container();
  private titleText?: Text;
  private statusText?: Text;
  private noticeText?: Text;

  private setup: LevelSetup;
  private state!: GolfState;
  private history: GolfState[] = [];
  private attempt = 0;

  private selected: number | null = null;
  private pressedCard: number | null = null;
  private pressOrigin = { x: 0, y: 0 };
  private dragging = false;
  private snapped: Move | null = null;
  private anim: MoveAnim | null = null;
  private pulse = 0;

  private chrome?: HTMLDivElement;
  private panel?: HTMLDivElement;
  private resizeObserver?: ResizeObserver;
  private tick = (): void => {};

  private constructor(private parent: HTMLElement, private opts: GameOptions) {
    this.setup = toSetup(opts.level);
  }

  static async create(parent: HTMLElement, opts: GameOptions): Promise<GameApp> {
    const g = new GameApp(parent, opts);
    await g.init();
    return g;
  }

  private async init() {
    await this.app.init({
      width: STAGE_W, height: STAGE_H,
      background: COLORS.paper, antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
    });
    this.parent.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.dotLayer, this.inkLayer, this.flightLayer, this.markerLayer,
      this.hintLayer, this.handLayer, this.hudLayer,
    );

    this.buildBoard();
    this.buildMarkers();
    this.buildHud();
    this.buildHand();
    this.buildChrome();
    this.bindInput();

    this.tick = () => this.onTick();
    this.app.ticker.add(this.tick);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.parent);
    this.fit();

    this.restart();
  }

  // ─── construction ──────────────────────────────────────────────────────────

  private buildBoard() {
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const dot = new Graphics().circle(0, 0, 3.2).fill(0xffffff);
        dot.position.set(dotX(gx), dotY(gy));
        this.dotLayer.addChild(dot);
        this.dots.push(dot);
      }
    }
  }

  private buildMarkers() {
    for (const c of this.setup.blocked) {
      const g = new Graphics()
        .roundRect(-6.5, -6.5, 13, 13, 3)
        .fill(COLORS.blocked);
      g.position.set(dotX(c.gx), dotY(c.gy));
      g.rotation = Math.PI / 4;
      this.markerLayer.addChild(g);
    }

    this.holeView.addChild(
      new Graphics().circle(0, 0, 10).stroke({ color: COLORS.hole, width: 2.5 }),
      new Graphics().circle(0, 0, 5).fill(COLORS.hole),
    );
    this.holeView.position.set(dotX(this.setup.hole.gx), dotY(this.setup.hole.gy));
    this.markerLayer.addChild(this.holeView);

    this.ballView.circle(0, 0, 7).fill(COLORS.ball);
    this.markerLayer.addChild(this.ballView);
  }

  private buildHud() {
    this.titleText = this.label(this.opts.level.name, 20, COLORS.text, '700');
    this.titleText.anchor.set(0.5, 0);
    this.titleText.position.set(STAGE_W / 2, 34);
    this.hudLayer.addChild(this.titleText);

    this.statusText = this.label('', 15, COLORS.textDim, '600');
    this.statusText.anchor.set(0.5, 0.5);
    this.statusText.position.set(STAGE_W / 2, STATUS_Y);
    this.hudLayer.addChild(this.statusText);

    this.noticeText = this.label('', 13, COLORS.highlight, '600');
    this.noticeText.anchor.set(0.5, 0.5);
    this.noticeText.position.set(STAGE_W / 2, STATUS_Y + 22);
    this.hudLayer.addChild(this.noticeText);
  }

  private label(text: string, size: number, fill: number, weight: '600' | '700' | '800') {
    return new Text({
      text,
      style: { fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: size, fill, fontWeight: weight },
    });
  }

  private buildHand() {
    for (let slot = 0; slot < 3; slot++) {
      const card = new Container();
      const face = new Graphics()
        .roundRect(0, 0, CARD_W, CARD_H, 14)
        .fill(COLORS.card)
        .stroke({ color: COLORS.cardEdge, width: 2 });
      const value = this.label('', 46, COLORS.ink, '800');
      value.anchor.set(0.5);
      value.position.set(CARD_W / 2, CARD_H / 2 - 8);
      const caption = this.label('steps', 12, COLORS.textDim, '600');
      caption.anchor.set(0.5);
      caption.position.set(CARD_W / 2, CARD_H - 26);
      card.addChild(face, value, caption);
      card.pivot.set(CARD_W / 2, CARD_H / 2);
      card.position.set(cardX(slot) + CARD_W / 2, HAND_TOP + CARD_H / 2);
      this.handLayer.addChild(card);
      this.cards.push(card);
    }
  }

  private buildChrome() {
    const bar = document.createElement('div');
    bar.className = 'game-chrome overlay';
    bar.innerHTML = `
      <button class="btn ghost small" data-act="menu">← Menu</button>
      <button class="btn ghost small" data-act="undo">↶ Undo</button>
      <button class="btn ghost small" data-act="retry">⟲ Retry</button>`;
    bar.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.opts.onMenu());
    bar.querySelector('[data-act="undo"]')!.addEventListener('click', () => this.undo());
    bar.querySelector('[data-act="retry"]')!.addEventListener('click', () => this.restart());
    this.parent.appendChild(bar);
    this.chrome = bar;
  }

  // ─── input ─────────────────────────────────────────────────────────────────

  private bindInput() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, STAGE_W, STAGE_H);
    this.app.stage.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.app.stage.on('pointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.app.stage.on('pointerup', (e: FederatedPointerEvent) => this.onUp(e));
    this.app.stage.on('pointerupoutside', (e: FederatedPointerEvent) => this.onUp(e));
  }

  private toStage(e: FederatedPointerEvent) {
    return this.root.toLocal(e.global);
  }

  private busy(): boolean {
    return this.anim !== null || this.state.status !== 'playing';
  }

  /** Which hand slot a stage point falls in, or null. */
  private cardSlotAt(x: number, y: number): number | null {
    if (y < HAND_TOP - 12 || y > HAND_BOTTOM + 12) return null;
    for (let slot = 0; slot < this.state.hand.length; slot++) {
      const left = cardX(slot);
      if (x >= left - 6 && x <= left + CARD_W + 6) return slot;
    }
    return null;
  }

  private onDown(e: FederatedPointerEvent) {
    if (this.busy()) return;
    const p = this.toStage(e);

    const slot = this.cardSlotAt(p.x, p.y);
    if (slot !== null) {
      if (legalMoves(this.state, this.state.hand[slot]).length === 0) return;
      this.pressedCard = slot;
      this.pressOrigin = { x: p.x, y: p.y };
      this.dragging = false;
      this.select(slot);
      return;
    }

    // A tap on the board plays the selected card if it lands somewhere legal.
    if (this.selected !== null) {
      const move = this.moveNear(p.x, p.y);
      if (move) this.commit(this.selected, move);
      else this.select(null);
    }
  }

  private onMove(e: FederatedPointerEvent) {
    if (this.pressedCard === null || this.busy()) return;
    const p = this.toStage(e);
    if (!this.dragging) {
      const dx = p.x - this.pressOrigin.x;
      const dy = p.y - this.pressOrigin.y;
      if (Math.hypot(dx, dy) < 8) return;
      this.dragging = true;
    }
    const card = this.cards[this.pressedCard];
    card.position.set(p.x, p.y - CARD_H * 0.45);
    card.scale.set(0.78);
    this.snapped = this.moveNear(p.x, p.y);
    this.drawFlight();
  }

  private onUp(_e: FederatedPointerEvent) {
    const slot = this.pressedCard;
    this.pressedCard = null;
    if (slot === null || this.busy()) return;

    if (this.dragging) {
      const move = this.snapped;
      this.dragging = false;
      this.snapped = null;
      this.resetCardPositions();
      this.drawFlight();
      if (move) this.commit(slot, move);
      else this.select(null);
    }
    // A plain tap leaves the card selected so the player can tap a target next.
  }

  /** Nearest legal landing for the selected card, if the finger is close enough. */
  private moveNear(x: number, y: number): Move | null {
    if (this.selected === null) return null;
    const distance = this.state.hand[this.selected];
    if (distance === undefined) return null;
    const guess = cellAt(x, y);
    let best: Move | null = null;
    let bestDist = SNAP_RADIUS;
    for (const move of legalMoves(this.state, distance)) {
      // A quick reject before the expensive check keeps this cheap on drag.
      if (Math.abs(move.target.gx - guess.gx) > 2 || Math.abs(move.target.gy - guess.gy) > 2) continue;
      const d = Math.hypot(dotX(move.target.gx) - x, dotY(move.target.gy) - y);
      if (d <= bestDist) { bestDist = d; best = move; }
    }
    return best;
  }

  private select(slot: number | null) {
    this.selected = slot;
    this.renderHand();
    this.renderHints();
  }

  private commit(slot: number, move: Move) {
    const next = playCard(this.state, slot, move.target);
    if (!next) return;
    this.history.push(this.state);
    this.select(null);
    this.anim = { from: this.state.ball, to: move.target, elapsed: 0, after: next };
  }

  private undo() {
    if (this.anim) return;
    const previous = this.history.pop();
    if (!previous) return;
    this.state = previous;
    this.select(null);
    this.renderAll();
  }

  restart() {
    this.attempt += 1;
    this.history = [];
    this.anim = null;
    this.selected = null;
    this.pressedCard = null;
    this.dragging = false;
    this.snapped = null;
    // A retry re-deals: the board is the same puzzle, the luck is fresh.
    this.state = createGame(this.setup, seedFrom(`${this.opts.level.id}:${this.attempt}`));
    this.resetCardPositions();
    this.renderAll();
    // A level can, in principle, be authored already walled in.
    if (this.state.status !== 'playing') this.showResult();
  }

  // ─── frame loop ────────────────────────────────────────────────────────────

  private onTick() {
    const ms = this.app.ticker.deltaMS;
    this.pulse += ms;

    if (this.anim) {
      this.anim.elapsed += ms;
      if (this.anim.elapsed >= MOVE_MS) {
        const { after } = this.anim;
        this.anim = null;
        this.state = after;
        this.renderAll();
        if (this.state.status !== 'playing') this.showResult();
      } else {
        this.drawFlight();
        return;
      }
    }

    for (const hint of this.hints) {
      hint.alpha = 0.55 + 0.45 * Math.sin(this.pulse / 260);
    }
  }

  // ─── rendering ─────────────────────────────────────────────────────────────

  private renderAll() {
    this.renderDots();
    this.renderInk();
    this.renderBall();
    this.renderHand();
    this.renderHints();
    this.renderHud();
    this.drawFlight();
  }

  private renderDots() {
    const blocked = new Set(this.setup.blocked.map((c) => key(c.gx, c.gy)));
    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (blocked.has(i)) { dot.visible = false; continue; }
      const spent = this.state.spent.has(i);
      dot.visible = true;
      dot.tint = spent ? COLORS.dotSpent : COLORS.dotLive;
      dot.scale.set(spent ? 0.7 : 1);
    }
  }

  private renderInk() {
    this.inkLayer.clear();
    for (const seg of this.state.trail) {
      this.inkLayer
        .moveTo(dotX(seg.from.gx), dotY(seg.from.gy))
        .lineTo(dotX(seg.to.gx), dotY(seg.to.gy))
        .stroke({ color: COLORS.ink, width: 3, cap: 'round', join: 'round' });
    }
  }

  private renderBall() {
    this.ballView.position.set(dotX(this.state.ball.gx), dotY(this.state.ball.gy));
  }

  /** The line currently being drawn: either a drag preview or the flying ball. */
  private drawFlight() {
    this.flightLayer.clear();

    if (this.anim) {
      const t = Math.min(1, this.anim.elapsed / MOVE_MS);
      const eased = 1 - (1 - t) * (1 - t);
      const x0 = dotX(this.anim.from.gx), y0 = dotY(this.anim.from.gy);
      const x1 = dotX(this.anim.to.gx), y1 = dotY(this.anim.to.gy);
      const cx = x0 + (x1 - x0) * eased, cy = y0 + (y1 - y0) * eased;
      this.flightLayer
        .moveTo(x0, y0).lineTo(cx, cy)
        .stroke({ color: COLORS.ink, width: 3, cap: 'round' });
      this.ballView.position.set(cx, cy);
      return;
    }

    if (this.dragging && this.snapped) {
      const x0 = dotX(this.state.ball.gx), y0 = dotY(this.state.ball.gy);
      const t = this.snapped.target;
      this.flightLayer
        .moveTo(x0, y0).lineTo(dotX(t.gx), dotY(t.gy))
        .stroke({ color: COLORS.highlight, width: 3, alpha: 0.55, cap: 'round' })
        .circle(dotX(t.gx), dotY(t.gy), 11)
        .stroke({ color: COLORS.highlight, width: 3 });
    }
  }

  private renderHints() {
    this.hintLayer.removeChildren().forEach((c) => c.destroy());
    this.hints = [];
    if (this.selected === null || this.state.status !== 'playing') return;

    const distance = this.state.hand[this.selected];
    if (distance === undefined) return;
    for (const move of legalMoves(this.state, distance)) {
      const ring = new Graphics()
        .circle(0, 0, 9)
        .stroke({ color: move.sinks ? COLORS.hole : COLORS.highlight, width: 2.5 });
      ring.position.set(dotX(move.target.gx), dotY(move.target.gy));
      this.hintLayer.addChild(ring);
      this.hints.push(ring);
    }
  }

  private renderHand() {
    for (let slot = 0; slot < this.cards.length; slot++) {
      const card = this.cards[slot];
      const value = this.state.hand[slot];
      card.visible = value !== undefined;
      if (value === undefined) continue;

      (card.children[1] as Text).text = String(value);
      const playable = legalMoves(this.state, value).length > 0;
      const face = card.children[0] as Graphics;
      face.clear()
        .roundRect(0, 0, CARD_W, CARD_H, 14)
        .fill(slot === this.selected ? 0xe8f0fb : COLORS.card)
        .stroke({ color: slot === this.selected ? COLORS.highlight : COLORS.cardEdge, width: slot === this.selected ? 3 : 2 });
      card.alpha = playable ? 1 : 0.35;
      if (slot !== this.pressedCard || !this.dragging) {
        card.scale.set(slot === this.selected ? 1.05 : 1);
      }
    }
  }

  private resetCardPositions() {
    for (let slot = 0; slot < this.cards.length; slot++) {
      this.cards[slot].position.set(cardX(slot) + CARD_W / 2, HAND_TOP + CARD_H / 2);
      this.cards[slot].scale.set(1);
    }
  }

  private renderHud() {
    const left = cardsLeft(this.state);
    if (this.statusText) {
      this.statusText.text = `${left} cards left  ·  par ${this.state.par}  ·  strokes ${this.state.strokes}`;
    }
    if (this.noticeText) {
      this.noticeText.text = this.state.burned > 0
        ? `${this.state.burned} card${this.state.burned === 1 ? '' : 's'} burned with no play`
        : '';
    }
  }

  // ─── end of level ──────────────────────────────────────────────────────────

  private showResult() {
    this.panel?.remove();
    const won = this.state.status === 'won';
    const diff = this.state.strokes - this.state.par;
    const scoreLine = diff === 0 ? 'level par' : diff < 0 ? `${-diff} under par` : `${diff} over par`;
    const reason = this.state.lostReason === 'boxed-in'
      ? 'Your own ink walled the ball in.'
      : 'The cards ran out.';

    const panel = document.createElement('div');
    panel.className = 'result overlay';
    panel.innerHTML = `
      <div class="result-card">
        <h2>${won ? 'Sunk it' : 'No way home'}</h2>
        <p>${won ? `${this.state.strokes} strokes — ${scoreLine}` : reason}</p>
        <div class="result-actions">
          ${won && this.opts.onNext ? '<button class="btn" data-act="next">Next level</button>' : ''}
          <button class="btn ghost" data-act="retry">Try again</button>
          <button class="btn ghost" data-act="menu">Levels</button>
        </div>
      </div>`;
    panel.querySelector('[data-act="retry"]')!.addEventListener('click', () => {
      this.panel?.remove(); this.panel = undefined; this.restart();
    });
    panel.querySelector('[data-act="menu"]')!.addEventListener('click', () => this.opts.onMenu());
    panel.querySelector('[data-act="next"]')?.addEventListener('click', () => this.opts.onNext?.());
    this.parent.appendChild(panel);
    this.panel = panel;
    if (won) this.opts.onWin?.();
  }

  // ─── plumbing ──────────────────────────────────────────────────────────────

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.parent;
    const scale = Math.min(w / STAGE_W, h / STAGE_H);
    this.app.stage.scale.set(scale);
    this.app.stage.position.set((w - STAGE_W * scale) / 2, (h - STAGE_H * scale) / 2);
    this.app.renderer.resize(w, h);
  }

  dispose() {
    this.app.ticker.remove(this.tick);
    this.resizeObserver?.disconnect();
    this.chrome?.remove();
    this.panel?.remove();
    this.dots = [];
    this.cards = [];
    this.hints = [];
    this.history = [];
    // destroys renderer, view canvas, and all stage children/graphics
    this.app.destroy({ removeView: true }, { children: true });
  }
}
