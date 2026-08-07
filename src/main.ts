import { MainMenu } from './ui/MainMenu';
import { GameApp } from './game/GameApp';
import { LevelStore } from './levels/store';
import { SupabaseBackend, MemoryBackend } from './levels/supabaseBackend';
import { BUILTIN_LEVELS } from './levels/builtin';
import { PROTOTYPE, HAS_BACKEND } from './config';
import type { LevelData } from './shared/types';

const appEl = document.getElementById('app')!;
const backend = HAS_BACKEND ? new SupabaseBackend() : new MemoryBackend();
const store = new LevelStore(PROTOTYPE, backend, BUILTIN_LEVELS);

let current: { dispose(): void } | undefined;
function clearApp() { current?.dispose(); current = undefined; }

// Level order as the menu last saw it, so a win can offer the next one.
let order: LevelData[] = BUILTIN_LEVELS;
let navSeq = 0;

function showMenu() {
  clearApp();
  navSeq++;
  current = new MainMenu(appEl, {
    store,
    onPlay: (lv) => showGame(lv),
    onLoaded: (levels) => { order = levels; },
  });
}

async function showGame(level: LevelData) {
  clearApp();
  const seq = ++navSeq;
  const next = order[order.findIndex((l) => l.id === level.id) + 1];
  const g = await GameApp.create(appEl, {
    level,
    onMenu: () => showMenu(),
    onNext: next ? () => showGame(next) : undefined,
  });
  if (seq !== navSeq) { g.dispose(); return; }  // superseded by a newer navigation
  current = g;
}

showMenu();
