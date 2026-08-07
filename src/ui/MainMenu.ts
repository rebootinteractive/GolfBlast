import type { LevelData } from '../shared/types';
import type { LevelStore } from '../levels/store';
import { toSetup } from '../levels/golfLevel';

export interface MenuOptions {
  store: LevelStore;
  onPlay: (level: LevelData) => void;
  onLoaded?: (levels: LevelData[]) => void;
}

export class MainMenu {
  private root: HTMLDivElement;

  constructor(private parent: HTMLElement, private opts: MenuOptions) {
    this.root = document.createElement('div');
    this.root.className = 'menu overlay';
    this.root.innerHTML = `
      <h1>GolfBlast</h1>
      <p class="menu-sub">Land the ball exactly on the hole. Every line you draw kills the dots it touches.</p>
      <div class="menu-list">Loading…</div>`;
    this.parent.appendChild(this.root);
    void this.load();
  }

  private async load() {
    const levels = await this.opts.store.list();
    if (!this.root.isConnected) return;
    this.opts.onLoaded?.(levels);

    const list = this.root.querySelector('.menu-list')!;
    list.innerHTML = '';
    levels.forEach((lv, i) => {
      const card = document.createElement('button');
      card.className = 'level-card';
      let sub = '';
      try {
        const setup = toSetup(lv);
        sub = `par ${setup.par} · ${setup.cards} cards`;
      } catch {
        sub = 'broken level';
      }
      const no = document.createElement('span');
      no.className = 'level-no';
      no.textContent = String(i + 1);
      const meta = document.createElement('span');
      meta.className = 'level-meta';
      const title = document.createElement('strong');
      title.textContent = lv.name;
      const detail = document.createElement('small');
      detail.textContent = sub;
      meta.append(title, detail);
      card.append(no, meta);
      card.onclick = () => this.opts.onPlay(lv);
      list.appendChild(card);
    });
  }

  dispose() { this.root.remove(); }
}
