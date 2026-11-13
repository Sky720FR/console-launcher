/* ===== Menu d'accueil : rendu + navigation clavier / manette ===== */

// Hors Electron (aperçu navigateur), on simule l'API pour pouvoir voir le rendu.
const API = window.api || (() => {
  let cfg = {
    style: 's2', theme: 'dark', accent: '#00c3e3', wallpaper: '', userName: 'Joueur', avatar: '',
    tileScale: 1, sounds: true, hideOnLaunch: true, steam: { enabled: true, filter: 'partial' },
    emulators: { s1: { name: 'Eden', path: 'eden.exe', args: ['-f', '-g', '{rom}'] }, s2: { name: 'Fritchii', path: 'lichii.exe', args: ['-f', '-g', '{rom}'] } },
    romDirs: [],
    games: ['Mario Kart 8 Deluxe', 'Super Mario Odyssey', 'The Legend of Zelda Ocarina of Time']
      .map((t, i) => ({ id: 'g' + i, title: t, path: t, console: i === 2 ? 's2' : 's1', cover: '', lastPlayed: 0 }))
  };
  const none = async () => null;
  return {
    getConfig: async () => structuredClone(cfg), saveConfig: async c => { cfg = c; },
    scan: async () => ({ cfg, added: 0 }), pickFile: none, pickFolder: none, importImage: none,
    launch: async () => ({ ok: true }), quit: none, toggleFullscreen: none, onGameExit() {}, onGameError() {}
  };
})();

const $ = s => document.querySelector(s);
const fileUrl = p => p ? 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23') : '';

let cfg;
let steamUser = null;   // { name, avatar } lu dans les fichiers de Steam
let row = 'games';      // 'games' | 'dock'
let gi = 0, di = 0;     // index sélectionné dans chaque rangée
let modal = null;       // { el, onClose }

/* ---------- Sons (générés, aucun fichier) ---------- */
let actx;
function beep(type) {
  if (!cfg?.sounds) return;
  actx ??= new AudioContext();
  const o = actx.createOscillator(), g = actx.createGain();
  const presets = {
    move:   [880, 0.04, 'sine', 0.05],
    ok:     [660, 0.12, 'triangle', 0.08],
    back:   [440, 0.08, 'sine', 0.06],
    launch: [523, 0.35, 'triangle', 0.1],
    style:  [740, 0.2, 'sine', 0.08]
  };
  const [f, d, w, v] = presets[type];
  o.type = w; o.frequency.value = f;
  if (type === 'launch') o.frequency.linearRampToValueAtTime(1046, actx.currentTime + d);
  if (type === 'style') o.frequency.linearRampToValueAtTime(988, actx.currentTime + d);
  g.gain.value = v; g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
}

/* ---------- Utilitaires ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function save() { return API.saveConfig(cfg); }
function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function sortedGames() {
  return [...cfg.games].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.title.localeCompare(b.title));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Icônes ---------- */
const I = {
  gear: '<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="#8a8a8a"/>',
  swap: '<path d="M7 7h11l-3-3 1.4-1.4L21.8 8l-5.4 5.4L15 12l3-3H7zm10 10H6l3 3-1.4 1.4L2.2 16l5.4-5.4L9 12l-3 3h11z" fill="var(--accent)"/>',
  plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z" fill="#2ecc71"/>',
  scan: '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm9 4a3 3 0 1 0 1.7 5.5l2.4 2.4 1.4-1.4-2.4-2.4A3 3 0 0 0 12 10zm0 1.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z" fill="#f5a623"/>',
  emu: '<path d="M7 6h10a5 5 0 0 1 5 5v2a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-2a5 5 0 0 1 5-5zm0 4v2H5v2h2v2h2v-2h2v-2H9v-2zm9 1a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 16 11zm2.5 2.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z" fill="#e74c3c"/>',
  full: '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z" fill="#9b59b6"/>',
  app: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 4v10h16V8zm6 2.5 5 3-5 3z" fill="#e67e22"/>',
  power: '<path d="M11 3h2v10h-2zm-4.2 2.6 1.4 1.4A6 6 0 1 0 15.8 7l1.4-1.4A8 8 0 1 1 6.8 5.6z" fill="#8a8a8a"/>',
  grid: '<path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/>'
};
const svg = p => `<svg viewBox="0 0 24 24">${p}</svg>`;

const DOCK = [
  { icon: 'gear',  label: 'Paramètres du menu', run: openSettings },
  { icon: 'swap',  label: 'Changer de style',   run: toggleStyle },
  { icon: 'plus',  label: 'Ajouter un jeu',     run: addGame },
  { icon: 'scan',  label: 'Rechercher des jeux', run: scanGames },
  { icon: 'emu',   label: 'Manettes',           run: openControllers },
  { icon: 'app',   label: "Ouvrir un émulateur", run: openEmulatorPicker },
  { icon: 'full',  label: 'Plein écran',        run: () => API.toggleFullscreen() },
  { icon: 'power', label: 'Quitter',            run: () => API.quit() }
];

/* ---------- Rendu ---------- */
/* Styles de menu : les deux modernes + des clins d'œil aux anciennes consoles.
   c = couleurs de l'aperçu (fond, accent, vignette). grid = vignettes en grille. */
// Consoles Nintendo, dans l'ordre de sortie (fonds d'écran dessinés dans backgrounds/)
const STYLES = [
  { id: 'nes',  name: 'NES',            era: '1985', c: ['#1b1b1b', '#e60012', '#bdbdbd'] },
  { id: 'snes', name: 'Super Nintendo', era: '1991', c: ['#d9d7e0', '#5b4a9e', '#a8a1d6'] },
  { id: 'n64',  name: 'Nintendo 64',    era: '1996', c: ['#141414', '#e5161d', '#0a3fa8'] },
  { id: 'cube', name: 'GameCube',       era: '2001', c: ['#211848', '#8a6cf0', '#4a3a9a'] },
  { id: 'ds',   name: 'Nintendo DS',    era: '2004', c: ['#e4e4e4', '#ff8a00', '#ffffff'], grid: true },
  { id: 'wii',  name: 'Wii',            era: '2006', c: ['#f2f2f2', '#34bdf0', '#d6d6d6'], grid: true },
  { id: 'p3d',  name: 'Nintendo 3DS',   era: '2011', c: ['#f7f7f7', '#2ac4f4', '#dddddd'], grid: true },
  { id: 'wiiu', name: 'Wii U',          era: '2012', c: ['#eef1f4', '#14b4e6', '#ffffff'], grid: true },
  { id: 's1',   name: 'Switch',         era: '2017', c: ['#2d2d2d', '#00c3e3', '#4a4a4a'] },
  { id: 's2',   name: 'Switch 2',       era: '2025', c: ['#121317', '#00c3e3', '#2a2c33'] }
];
const styleInfo = id => STYLES.find(s => s.id === id) || STYLES[1];
const isGrid = () => !!styleInfo(cfg.style).grid;

function applyLook() {
  const b = document.body;
  const st = styleInfo(cfg.style);
  const retro = st.id !== 's1' && st.id !== 's2';
  b.className = `${st.id} ${cfg.theme}` + (retro ? ' retro' : '') + (st.grid ? ' grid-layout' : '') + (cfg.wallpaper ? ' has-wall' : '');
  // Les styles rétro ont leurs propres couleurs ; la couleur d'accent perso s'applique aux styles modernes
  if (retro) b.style.removeProperty('--accent'); else b.style.setProperty('--accent', cfg.accent);
  $('#pad-name').textContent = `${st.name} · ${st.era}`;
  b.style.setProperty('--scale', cfg.tileScale);
  $('#wallpaper').style.backgroundImage = cfg.wallpaper ? `url("${fileUrl(cfg.wallpaper)}")` : '';
  // Profil : celui de Steam si l'option est active et qu'un compte est trouvé, sinon le profil perso
  const useSteam = cfg.useSteamProfile !== false && steamUser;
  const name = useSteam ? steamUser.name : cfg.userName;
  const avatar = useSteam ? steamUser.avatar : cfg.avatar;
  const av = $('#avatar');
  av.style.backgroundImage = avatar ? `url("${fileUrl(avatar)}")` : '';
  av.textContent = avatar ? '' : (name[0] || '?').toUpperCase();
  $('#username').textContent = name;
}

function renderGames() {
  const list = sortedGames();
  const box = $('#games');
  box.innerHTML = '';
  list.forEach((g, i) => {
    const t = document.createElement('div');
    t.className = 'tile';
    if (g.cover) { t.style.backgroundImage = `url("${fileUrl(g.cover)}")`; t.classList.add('cover'); }
    else {
      const h = hue(g.title);
      t.style.background = `linear-gradient(135deg, hsl(${h} 70% 50%), hsl(${(h + 50) % 360} 70% 32%))`;
      t.innerHTML = g.logo
        ? `<img class="logo" src="${fileUrl(g.logo)}" alt="${esc(g.title)}">`
        : `<div class="ph">${esc(g.title)}</div>`;
    }
    const tag = g.console === 'pc' ? pcLabel(g.path) : CONSOLES[g.console] || '?';
    t.insertAdjacentHTML('beforeend', `<span class="badge ${g.console}${g.console === 'pc' && tag !== 'PC' ? ' custom' : ''}">${esc(tag)}</span>`);
    t.onclick = () => { row = 'games'; gi = i; updateSel(); activate(); };
    t.oncontextmenu = e => { e.preventDefault(); row = 'games'; gi = i; updateSel(); openGameMenu(); };
    box.appendChild(t);
  });
  // Dernière vignette : "Tous les jeux"
  const all = document.createElement('div');
  all.className = 'tile all';
  all.innerHTML = `<div class="ph">${svg(I.grid)}Tous les jeux</div>`;
  all.onclick = () => { row = 'games'; gi = list.length; updateSel(); activate(); };
  box.appendChild(all);
  gi = Math.min(gi, list.length);
  updateSel();
}

function renderDock() {
  $('#dock').innerHTML = DOCK.map((d, i) =>
    `<div class="dock-btn" data-i="${i}">${svg(I[d.icon])}<span class="lbl">${d.label}</span></div>`).join('');
  document.querySelectorAll('.dock-btn').forEach(b => {
    b.onclick = () => { row = 'dock'; di = +b.dataset.i; updateSel(); activate(); };
  });
}

function updateSel() {
  const tiles = [...document.querySelectorAll('.tile')];
  tiles.forEach((t, i) => t.classList.toggle('sel', row === 'games' && i === gi));
  document.querySelectorAll('.dock-btn').forEach((b, i) => b.classList.toggle('sel', row === 'dock' && i === di));
  const list = sortedGames();
  const g = list[gi];
  $('#game-title').innerHTML = row !== 'games' ? '' : esc(g?.title ?? 'Tous les jeux') +
    (g?.playtime ? ` <span class="meta">· ${fmtPlaytime(g.playtime)}</span>` : '');
  const tile = tiles[gi]; if (!tile) return;
  if (isGrid()) {
    // Styles en grille : défilement vertical par rangée
    const cols = gridCols();
    const gap = parseFloat(getComputedStyle($('#games')).rowGap) || 0;
    const rowH = tile.offsetHeight + gap;
    const visibleRows = Math.max(1, Math.floor(($('#row-wrap').clientHeight + gap) / rowH));
    const r = Math.floor(gi / cols);
    $('#games').style.transform = `translateY(${-Math.max(0, r - visibleRows + 1) * rowH}px)`;
    return;
  }
  // Défilement horizontal pour garder la vignette visible
  const wrap = $('#row-wrap').clientWidth;
  const step = tile.offsetWidth + parseFloat(getComputedStyle($('#games')).gap);
  const visible = Math.max(1, Math.floor((wrap - 224) / step));
  const offset = Math.max(0, gi - visible + 1) * step;
  $('#games').style.transform = `translateX(${-offset}px)`;
}

// Temps de jeu Steam (minutes) → "12 h 30 de jeu"
function fmtPlaytime(min) {
  if (min < 60) return `${min} min de jeu`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} h${m ? ' ' + String(m).padStart(2, '0') : ''} de jeu`;
}

// Nombre de vignettes par rangée (styles en grille)
function gridCols() {
  const tiles = [...document.querySelectorAll('.tile')];
  if (!tiles.length) return 1;
  const top = tiles[0].offsetTop;
  return Math.max(1, tiles.filter(t => t.offsetTop === top).length);
}

function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
async function battery() {
  try {
    const b = await navigator.getBattery();
    const upd = () => {
      $('#batt-fill').style.width = `calc(${Math.round(b.level * 100)}% - 4px)`;
      $('#batt-level').textContent = b.charging && b.level === 1 ? '' : Math.round(b.level * 100) + '%';
    };
    upd(); b.onlevelchange = upd; b.onchargingchange = upd;
  } catch {}
}

/* ---------- Actions ---------- */
const CONSOLES = { s1: 'Switch 1', s2: 'Switch 2', steam: 'Steam', pc: 'PC' };
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const slash = p => p.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
// Étiquette d'un jeu PC = celle du dossier où il se trouve (réglable dans Paramètres → Jeux PC)
function pcLabel(gamePath) {
  const p = slash(gamePath);
  const dir = (cfg.pcDirs || []).find(d => p.startsWith(slash(d) + '\\'));
  return (dir && cfg.pcLabels?.[dir]) || 'PC';
}
const EMU_KEYS = ['s1', 's2'];
const emuLabel = k => `${CONSOLES[k]} (${cfg.emulators[k]?.name || '?'})`;
const runnerName = k => EMU_KEYS.includes(k) ? cfg.emulators[k].name : CONSOLES[k];

async function launch(game, consoleKey) {
  beep('launch');
  if (game) { game.lastPlayed = Date.now(); await save(); }
  const key = game ? game.console : consoleKey;
  const r = await API.launch(game ? game.path : null, key);
  if (!r.ok) return toast(r.error);
  toast(game ? `Lancement de ${game.title} sur ${runnerName(key)}…` : `Ouverture de ${runnerName(key)}…`);
  if (game) { gi = 0; renderGames(); }
}

function activate() {
  if (row === 'dock') { beep('ok'); return DOCK[di].run(); }
  const list = sortedGames();
  if (gi >= list.length) return openAllGames();
  launch(list[gi]);
}

async function toggleStyle() {
  beep('style');
  const i = STYLES.findIndex(s => s.id === cfg.style);
  cfg.style = STYLES[(i + 1) % STYLES.length].id;
  applyLook(); await save(); requestAnimationFrame(updateSel);
  const st = styleInfo(cfg.style);
  toast(`Style : ${st.name} (${st.era})`);
}

async function addGame() {
  const p = await API.pickFile('rom'); if (!p) return;
  const title = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
  cfg.games.push({ id: Date.now().toString(36), title, path: p, console: /\.nup$/i.test(p) ? 's2' : 's1', cover: '', lastPlayed: 0 });
  await save(); renderGames(); toast(`${title} ajouté`);
}

async function scanGames(quiet = false) {
  if (!quiet) toast('Recherche des jeux…');
  const { cfg: c, added, removed } = await API.scan();
  cfg = c; renderGames();
  const parts = [];
  if (added) parts.push(`${added} jeu(x) ajouté(s)`);
  if (removed) parts.push(`${removed} retiré(s)`);
  if (parts.length) toast(parts.join(' · '));
  else if (!quiet) toast('Aucun nouveau jeu trouvé');
}

/* ---------- Modales ---------- */
function openModal(html, onClose) {
  const layer = $('#modal-layer');
  layer.innerHTML = `<div class="modal">${html}</div>`;
  modal = { el: layer.firstChild, onClose };
  layer.onclick = e => { if (e.target === layer) closeModal(); };
  setTimeout(() => focusables()[0]?.focus(), 0);
  return modal.el;
}
function closeModal() {
  if (!modal) return;
  const cb = modal.onClose; modal = null;
  $('#modal-layer').innerHTML = '';
  beep('back'); cb?.();
}
const focusables = () => modal ? [...modal.el.querySelectorAll('button, input, select')] : [];

function openGameMenu() {
  const g = sortedGames()[gi]; if (!g) return;
  const el = openModal(`
    <h2>${esc(g.title)}</h2>
    <button class="list-btn" data-a="play">▶ Lancer</button>
    <button class="list-btn" data-a="search">🔎 Rechercher une nouvelle image</button>
    <button class="list-btn" data-a="cover">🖼 Choisir une image sur le PC…</button>
    ${g.cover ? '<button class="list-btn" data-a="nocover">Retirer la jaquette</button>' : ''}
    ${g.console === 'steam'
      ? `<div class="row"><label>Steam</label><div class="ctl small">Compat. manette : ${{ full: 'complète', partial: 'partielle' }[g.controller] || 'non indiquée'}</div></div>`
      : g.console === 'pc' ? ''
      : `<div class="row"><label>Console</label><div class="ctl">
      ${EMU_KEYS.map(k => `<button data-console="${k}" class="${g.console === k ? 'on' : ''}">${emuLabel(k)}</button>`).join('')}</div></div>`}
    <div class="row"><label>Nom</label><div class="ctl"><input type="text" id="g-name" value="${esc(g.title)}"></div></div>
    <button class="list-btn" data-a="remove">🙈 Masquer (il revient à la prochaine ouverture)</button>
    <p class="small">${esc(g.path)}</p>`);
  el.querySelectorAll('[data-console]').forEach(b => b.onclick = async () => {
    g.console = b.dataset.console; await save(); renderGames(); openGameMenu();
    modal.el.querySelector(`[data-console="${g.console}"]`)?.focus();
  });
  el.querySelector('#g-name').onchange = async e => { g.title = e.target.value.trim() || g.title; await save(); renderGames(); };
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'play') { closeModal(); return launch(g); }
    if (a === 'search') return openCoverSearch(g, g.title);
    if (a === 'cover') {
      const p = await API.pickFile('image'); if (!p) return;
      g.cover = await API.importImage(p);
    }
    if (a === 'nocover') g.cover = '';
    if (a === 'remove') {
      // Masqué seulement pour cette session : le scan du prochain démarrage le remet
      cfg.games = cfg.games.filter(x => x.id !== g.id);
    }
    await save(); renderGames(); closeModal();
  });
}

// Fenêtre de recherche d'image : propose plusieurs images en ligne, on clique sur celle qu'on veut
async function openCoverSearch(g, term) {
  const src = EMU_KEYS.includes(g.console) ? "l'eShop Nintendo" : 'Steam';
  const el = openModal(`
    <h2>Nouvelle image : ${esc(g.title)}</h2>
    <div class="row"><label>Recherche sur ${src}</label><div class="ctl">
      <input type="text" id="c-term" value="${esc(term)}"><button id="c-go">Rechercher</button></div></div>
    <div id="c-list" class="cands"><p class="small">Recherche en cours…</p></div>
    <button class="list-btn" id="c-back">← Retour</button>`);
  const go = () => openCoverSearch(g, el.querySelector('#c-term').value.trim() || g.title);
  el.querySelector('#c-go').onclick = go;
  el.querySelector('#c-term').onkeydown = e => { if (e.key === 'Enter') go(); };
  el.querySelector('#c-back').onclick = () => openGameMenu();

  const list = await API.searchCovers(g.console, term);
  if (modal?.el !== el) return;   // fenêtre fermée ou remplacée entre-temps
  const box = el.querySelector('#c-list');
  if (!list.length) { box.innerHTML = '<p class="small">Aucune image trouvée. Essaie un autre nom (en anglais par exemple).</p>'; return; }
  box.innerHTML = list.map((c, i) =>
    `<button class="cand" data-i="${i}" title="${esc(c.label)}"><img src="${esc(c.url)}" loading="lazy"><span>${esc(c.label)}</span></button>`).join('');
  // Retire les images qui ne se chargent pas
  box.querySelectorAll('img').forEach(img => img.onerror = () => img.closest('.cand').remove());
  box.querySelectorAll('.cand').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const f = await API.pickCover(list[+b.dataset.i].url);
    if (!f) { b.disabled = false; return toast("Impossible de télécharger cette image"); }
    g.cover = f; g.logo = '';
    await save(); renderGames(); closeModal();
    toast('Image mise à jour');
  });
  box.querySelector('.cand')?.focus();
}

/* ---------- Manettes : test en direct + accès aux réglages de chaque plateforme ---------- */
// Disposition Nintendo : sur une manette Xbox, A et B sont inversés, X et Y aussi
// (le bouton de droite fait A, celui du bas fait B, celui du haut fait X, celui de gauche fait Y).
// Numéros des boutons (standard navigateur) : 0 = bas, 1 = droite, 2 = gauche, 3 = haut.
const padFaceMap = () => cfg?.nintendoLayout !== false
  ? [[1, 'A'], [0, 'B'], [3, 'X'], [2, 'Y']]
  : [[0, 'A'], [1, 'B'], [2, 'X'], [3, 'Y']];
const padLabels = () => { const l = [...PAD_LABELS]; for (const [i, n] of padFaceMap()) l[i] = n; return l; };
const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];

function openControllers() {
  const el = openModal(`
    <h2>Manettes</h2>
    <h3>Manettes détectées</h3>
    <div id="pad-list"><p class="small">Aucune manette détectée. Branche-la ou appuie sur un bouton.</p></div>

    <h3>Configurer les touches dans les jeux</h3>
    <button class="list-btn" data-p="s1">🎮 Jeux Switch 1 — configurer dans ${esc(cfg.emulators.s1.name)}</button>
    <p class="small">S'ouvre directement sur la page Controls. Ferme l'émulateur pour revenir au menu.</p>
    <button class="list-btn" data-p="s2">🎮 Jeux Switch 2 — configurer dans ${esc(cfg.emulators.s2.name)}</button>
    <p class="small">Pareil : s'ouvre directement sur la page Controls.</p>
    <button class="list-btn" data-p="steam">🎮 Jeux Steam — réglages manette de Steam</button>
    <p class="small">Pour un jeu précis : dans Steam, clic droit sur le jeu → Gérer → Disposition de la manette.</p>
    <button class="list-btn" data-p="windows">🎮 Jeux PC — manettes Windows</button>
    <p class="small">Ouvre le panneau « Contrôleurs de jeu » de Windows pour tester et calibrer la manette.</p>`);

  el.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
    const p = b.dataset.p;
    const r = await API.openPads(p);
    if (!r.ok) return toast(r.error);
    if (p === 's1' || p === 's2') { closeModal(); return toast(`Ouverture des contrôles de ${cfg.emulators[p].name}…`); }
    toast(p === 'steam' ? 'Ouverture des réglages Steam…' : 'Ouverture du panneau Windows…');
  });

  // Test en direct : les boutons appuyés s'allument, les joysticks bougent
  const list = el.querySelector('#pad-list');
  let lastIds = '';
  (function loop() {
    if (modal?.el !== el) return;           // fenêtre fermée → on arrête
    const pads = [...navigator.getGamepads()].filter(Boolean);
    const ids = pads.map(p => p.index + p.id).join('|');
    if (ids !== lastIds) {
      lastIds = ids;
      list.innerHTML = pads.length ? pads.map(p => `
        <div class="pad-card" data-pad="${p.index}">
          <div class="pad-name">Manette ${p.index + 1} · ${esc(p.id.replace(/\(.*?\)/g, '').trim() || 'Manette')}</div>
          <div class="pad-btns">${padLabels().map((l, i) => `<span data-b="${i}">${l}</span>`).join('')}</div>
          <div class="pad-sticks"><div class="stick"><i></i></div><div class="stick"><i></i></div></div>
        </div>`).join('')
        : '<p class="small">Aucune manette détectée. Branche-la ou appuie sur un bouton.</p>';
    }
    for (const p of pads) {
      const card = list.querySelector(`[data-pad="${p.index}"]`); if (!card) continue;
      card.querySelectorAll('[data-b]').forEach(s => s.classList.toggle('on', !!p.buttons[+s.dataset.b]?.pressed));
      card.querySelectorAll('.stick i').forEach((dot, k) => {
        const x = p.axes[k * 2] || 0, y = p.axes[k * 2 + 1] || 0;
        dot.style.transform = `translate(${x * 14}px, ${y * 14}px)`;
      });
    }
    requestAnimationFrame(loop);
  })();
}

function openEmulatorPicker() {
  const el = openModal(`<h2>Ouvrir un émulateur</h2>` +
    EMU_KEYS.map(k => `<button class="list-btn" data-k="${k}">${emuLabel(k)}</button>`).join(''));
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { closeModal(); launch(null, b.dataset.k); });
}

function openAllGames() {
  const list = sortedGames();
  const el = openModal(`<h2>Tous les jeux (${list.length})</h2>` +
    (list.length ? list.map((g, i) => `<button class="list-btn" data-i="${i}">${esc(g.title)}</button>`).join('')
      : '<p>Aucun jeu. Utilise « Rechercher des jeux » ou « Ajouter un jeu ».</p>'));
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { closeModal(); launch(list[+b.dataset.i]); });
}

const ACCENTS = ['#00c3e3', '#e60012', '#ff6f00', '#ffd400', '#2ecc71', '#3d7bff', '#9b59b6', '#ff4fa3'];

function openSettings() {
  const el = openModal(`
    <h2>Paramètres du menu</h2>

    <h3>Apparence</h3>
    <div class="row"><label>Style du menu</label><div class="ctl">
</div></div>
    <div class="style-grid">${STYLES.map(s => `
      <button data-style="${s.id}" class="style-card ${cfg.style === s.id ? 'on' : ''}">
        <span class="sp" style="background:${s.c[0]}">
          <i style="background:${s.c[2]}"></i><i style="background:${s.c[2]};outline:3px solid ${s.c[1]}"></i><i style="background:${s.c[2]}"></i>
        </span>
        <b>${s.name}</b><small>${s.era}</small>
      </button>`).join('')}</div>
    <div class="row"><label>Thème</label><div class="ctl">
      <button data-theme="dark" class="${cfg.theme === 'dark' ? 'on' : ''}">Sombre</button>
      <button data-theme="light" class="${cfg.theme === 'light' ? 'on' : ''}">Clair</button></div></div>
    <div class="row"><label>Couleur d'accent</label><div class="ctl">
      ${ACCENTS.map(c => `<button class="swatch" data-accent="${c}" style="background:${c}"></button>`).join('')}
      <input type="color" id="s-accent" value="${cfg.accent}"></div></div>
    <div class="row"><label>Fond d'écran</label><div class="ctl">
      <button id="s-wall">Choisir…</button>${cfg.wallpaper ? '<button id="s-nowall">Retirer</button>' : ''}</div></div>
    <div class="row"><label>Taille des vignettes</label><div class="ctl">
      <input type="range" id="s-scale" min="0.6" max="1.5" step="0.05" value="${cfg.tileScale}"></div></div>

    <h3>Profil</h3>
    ${steamUser ? `<div class="row"><label>Utiliser mon profil Steam (${esc(steamUser.name)})</label><div class="ctl"><input type="checkbox" id="s-steamprof" ${cfg.useSteamProfile !== false ? 'checked' : ''}></div></div>
    <p class="small">Pseudo et avatar lus dans Steam sur ce PC : aucun mot de passe, rien n'est envoyé en ligne. Décoche pour utiliser le nom et l'image ci-dessous.</p>` : ''}
    <div class="row"><label>Nom</label><div class="ctl"><input type="text" id="s-name" value="${esc(cfg.userName)}"></div></div>
    <div class="row"><label>Avatar</label><div class="ctl">
      <button id="s-avatar">Choisir une image…</button>${cfg.avatar ? '<button id="s-noavatar">Retirer</button>' : ''}</div></div>

    <h3>Système</h3>
    <div class="row"><label>Disposition Nintendo (A/B et X/Y inversés sur manette Xbox)</label><div class="ctl"><input type="checkbox" id="s-nlayout" ${cfg.nintendoLayout !== false ? 'checked' : ''}></div></div>
    <div class="row"><label>Sons du menu</label><div class="ctl"><input type="checkbox" id="s-sounds" ${cfg.sounds ? 'checked' : ''}></div></div>
    <div class="row"><label>Réduire le menu pendant le jeu</label><div class="ctl"><input type="checkbox" id="s-hide" ${cfg.hideOnLaunch ? 'checked' : ''}></div></div>

    <h3>Émulateurs</h3>
    ${EMU_KEYS.map(k => `
    <div class="row"><label>${emuLabel(k)}</label><div class="ctl"><button data-emu="${k}">Changer…</button></div></div>
    <p class="small">${esc(cfg.emulators[k].path)}</p>
    <div class="row"><label>Arguments ({rom} = le jeu)</label><div class="ctl"><input type="text" data-args="${k}" value="${esc(cfg.emulators[k].args.join(' '))}"></div></div>`).join('')}

    <h3>Dossiers de jeux</h3>
    ${cfg.romDirs.map((d, i) => `<div class="dir"><span>${esc(d)}</span><button data-deldir="${i}">Retirer</button></div>`).join('')}
    <div class="row"><label></label><div class="ctl"><button id="s-adddir">Ajouter un dossier…</button><button id="s-scan">Rechercher maintenant</button></div></div>

    <h3>Steam</h3>
    <div class="row"><label>Afficher les jeux Steam</label><div class="ctl"><input type="checkbox" id="s-steam" ${cfg.steam.enabled ? 'checked' : ''}></div></div>
    <div class="row"><label>Compatibilité manette</label><div class="ctl">
      ${[['full', 'Complète'], ['partial', 'Complète + partielle'], ['all', 'Tous les jeux']]
        .map(([v, l]) => `<button data-sfilter="${v}" class="${cfg.steam.filter === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>

    <h3>Jeux PC</h3>
    ${(cfg.pcDirs || []).map((d, i) => `<div class="dir"><span>${esc(d)}</span><span class="ctl">
      <input type="text" data-pclabel="${i}" value="${esc(cfg.pcLabels?.[d] || 'PC')}" style="width:140px" title="Étiquette affichée sur les jeux de ce dossier">
      <button data-delpc="${i}">Retirer</button></span></div>`).join('')}
    <div class="row"><label>Un sous-dossier = un jeu</label><div class="ctl"><button id="s-addpc">Ajouter un dossier…</button></div></div>

    <h3>Jaquettes</h3>
    <div class="row"><label>Télécharger les jaquettes automatiquement</label><div class="ctl"><input type="checkbox" id="s-autocov" ${cfg.autoCovers ? 'checked' : ''}></div></div>
    <div class="row"><label>Jeux sans jaquette</label><div class="ctl"><button id="s-retrycov">Réessayer</button></div></div>
    <div class="row"><label>Clé API SteamGridDB (logos, facultatif)</label><div class="ctl"><input type="password" id="s-sgdb" value="${esc(cfg.sgdbKey || '')}" placeholder="Colle ta clé ici" style="width:260px"></div></div>
    <p class="small">Clic droit (ou X) sur un jeu pour changer sa jaquette ou son nom.</p>
  `);
  el.querySelector('#s-addpc').onclick = async () => { const p = await API.pickFolder(); if (p) { cfg.pcDirs = [...(cfg.pcDirs || []), p]; await save(); await scanGames(); openSettings(); } };
  el.querySelectorAll('[data-pclabel]').forEach(i => i.onchange = async e => {
    cfg.pcLabels = { ...(cfg.pcLabels || {}), [cfg.pcDirs[+i.dataset.pclabel]]: e.target.value.trim() || 'PC' };
    await save(); renderGames();
  });
  el.querySelectorAll('[data-delpc]').forEach(b => b.onclick = async () => {
    const dir = cfg.pcDirs.splice(+b.dataset.delpc, 1)[0].replace(/\//g, '\\').toLowerCase();
    cfg.games = cfg.games.filter(g => !(g.console === 'pc' && g.path.toLowerCase().startsWith(dir)));
    await save(); renderGames(); openSettings();
  });
  el.querySelector('#s-autocov').onchange = async e => { cfg.autoCovers = e.target.checked; await save(); };
  el.querySelector('#s-retrycov').onclick = async () => {
    cfg.games.forEach(g => { if (!g.cover) { delete g.coverTried; delete g.logoTried; } });
    await save(); await scanGames();
  };
  el.querySelector('#s-sgdb').onchange = async e => {
    cfg.sgdbKey = e.target.value.trim();
    cfg.games.forEach(g => { if (!g.cover && !g.logo) delete g.logoTried; });  // nouvelle clé → on retente les logos
    await save(); await scanGames();
  };
  const steamSet = async (k, v) => { cfg.steam[k] = v; await save(); await scanGames(); openSettings(); };
  el.querySelector('#s-steam').onchange = e => steamSet('enabled', e.target.checked);
  el.querySelectorAll('[data-sfilter]').forEach(b => b.onclick = () => steamSet('filter', b.dataset.sfilter));

  const set = async (k, v, reopen = true) => {
    cfg[k] = v; applyLook(); await save(); renderGames();
    if (reopen) { const f = document.activeElement?.id; openSettings(); if (f) modal.el.querySelector('#' + f)?.focus(); }
  };
  el.querySelectorAll('[data-style]').forEach(b => b.onclick = () => set('style', b.dataset.style));
  el.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => set('theme', b.dataset.theme));
  el.querySelectorAll('[data-accent]').forEach(b => b.onclick = () => set('accent', b.dataset.accent));
  el.querySelector('#s-accent').oninput = e => set('accent', e.target.value, false);
  el.querySelector('#s-scale').oninput = e => set('tileScale', +e.target.value, false);
  el.querySelector('#s-steamprof')?.addEventListener('change', e => set('useSteamProfile', e.target.checked));
  el.querySelector('#s-name').onchange = e => set('userName', e.target.value.trim() || 'Joueur', false);
  el.querySelector('#s-nlayout').onchange = e => set('nintendoLayout', e.target.checked, false);
  el.querySelector('#s-sounds').onchange = e => set('sounds', e.target.checked, false);
  el.querySelector('#s-hide').onchange = e => set('hideOnLaunch', e.target.checked, false);
  el.querySelectorAll('[data-args]').forEach(i => i.onchange = e => { cfg.emulators[i.dataset.args].args = e.target.value.trim().split(/\s+/); save(); });
  el.querySelector('#s-wall').onclick = async () => { const p = await API.pickFile('image'); if (p) set('wallpaper', await API.importImage(p)); };
  el.querySelector('#s-nowall')?.addEventListener('click', () => set('wallpaper', ''));
  el.querySelector('#s-avatar').onclick = async () => { const p = await API.pickFile('image'); if (p) set('avatar', await API.importImage(p)); };
  el.querySelector('#s-noavatar')?.addEventListener('click', () => set('avatar', ''));
  el.querySelectorAll('[data-emu]').forEach(b => b.onclick = async () => {
    const p = await API.pickFile('exe'); if (!p) return;
    const k = b.dataset.emu;
    cfg.emulators[k].path = p;
    cfg.emulators[k].name = p.split(/[\\/]/).pop().replace(/\.exe$/i, '');
    await save(); openSettings();
  });
  el.querySelector('#s-adddir').onclick = async () => { const p = await API.pickFolder(); if (p) { cfg.romDirs.push(p); await save(); openSettings(); } };
  el.querySelectorAll('[data-deldir]').forEach(b => b.onclick = async () => { cfg.romDirs.splice(+b.dataset.deldir, 1); await save(); openSettings(); });
  el.querySelector('#s-scan').onclick = async () => { await scanGames(); };
}

/* ---------- Navigation ---------- */
function move(dir) {
  if (modal) {
    const f = focusables(), i = f.indexOf(document.activeElement);
    if (dir === 'up' || dir === 'down') {
      const n = f[(i + (dir === 'down' ? 1 : -1) + f.length) % f.length];
      n?.focus(); n?.scrollIntoView({ block: 'nearest' });
    } else {
      const el = document.activeElement;
      if (el?.type === 'range') { el.value = +el.value + (dir === 'right' ? 1 : -1) * +el.step; el.dispatchEvent(new Event('input')); }
      else { const n = f[(i + (dir === 'right' ? 1 : -1) + f.length) % f.length]; n?.focus(); }
    }
    return beep('move');
  }
  const count = sortedGames().length + 1;
  if (dir === 'left')  row === 'games' ? (gi = Math.max(0, gi - 1)) : (di = Math.max(0, di - 1));
  if (dir === 'right') row === 'games' ? (gi = Math.min(count - 1, gi + 1)) : (di = Math.min(DOCK.length - 1, di + 1));
  if (isGrid() && row === 'games' && (dir === 'up' || dir === 'down')) {
    // En grille : haut/bas change de rangée ; sous la dernière rangée on descend sur les boutons
    const cols = gridCols();
    if (dir === 'up') gi = Math.max(0, gi - cols);
    else if (gi + cols < count) gi += cols;
    else if (Math.floor(gi / cols) < Math.floor((count - 1) / cols)) gi = count - 1;
    else row = 'dock';
  } else {
    if (dir === 'down') row = 'dock';
    if (dir === 'up') row = 'games';
  }
  beep('move'); updateSel();
}

function press(btn) {
  if (modal) {
    if (btn === 'B') return closeModal();
    if (btn === 'A') {
      const el = document.activeElement;
      if (el?.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
      else if (el?.tagName === 'BUTTON') el.click();
    }
    return;
  }
  if (btn === 'A') activate();
  if (btn === 'X' && row === 'games' && gi < sortedGames().length) { beep('ok'); openGameMenu(); }
  if (btn === 'Y') toggleStyle();
  if (btn === 'START') { beep('ok'); openSettings(); }
}

document.addEventListener('keydown', e => {
  const typing = e.target.tagName === 'INPUT' && e.target.type === 'text';
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (map[e.key] && !(typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) { e.preventDefault(); return move(map[e.key]); }
  if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) return press('B');
  if (typing) { if (e.key === 'Enter') e.target.blur(); return; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return press('A'); }
  if (e.key === 'Tab' || e.key.toLowerCase() === 'y') { e.preventDefault(); return press('Y'); }
  if (e.key.toLowerCase() === 'x') return press('X');
  if (e.key.toLowerCase() === 's' || e.key === '-' || e.key === '+') return press('START');
});
document.addEventListener('wheel', e => { if (!modal) move(e.deltaY > 0 || e.deltaX > 0 ? 'right' : 'left'); });

/* Manette (mapping standard type Xbox : 0=A 1=B 2=X 3=Y 9=Start, 12-15 = croix) */
const held = {};
function pollPad() {
  const pad = [...navigator.getGamepads()].find(Boolean);
  document.body.classList.toggle('no-pad', !pad);
  if (pad) {
    const now = performance.now();
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const dirs = {
      up: pad.buttons[12]?.pressed || ay < -0.6, down: pad.buttons[13]?.pressed || ay > 0.6,
      left: pad.buttons[14]?.pressed || ax < -0.6, right: pad.buttons[15]?.pressed || ax > 0.6
    };
    for (const [d, on] of Object.entries(dirs)) {
      if (on) {
        if (!held[d]) { held[d] = now + 350; move(d); }
        else if (now > held[d]) { held[d] = now + 110; move(d); }
      } else held[d] = 0;
    }
    for (const [i, name] of [...padFaceMap(), [8, 'START'], [9, 'START']]) {
      const on = pad.buttons[i]?.pressed;
      if (on && !held[name] && document.hasFocus()) press(name);
      held[name] = on;
    }
  }
  requestAnimationFrame(pollPad);
}

/* ---------- Démarrage ---------- */
(async function init() {
  cfg = await API.getConfig();
  try { steamUser = await API.steamProfile?.(); } catch {}
  applyLook(); renderDock(); renderGames();
  tick(); setInterval(tick, 10000); battery();
  scanGames(true); // met la liste à jour à chaque démarrage (nouveaux jeux Steam, ROM…)
  API.onGameExit(() => { gi = 0; renderGames(); });
  API.onGameError(msg => toast(msg));
  window.addEventListener('resize', updateSel);
  $('#hint-options').onclick = () => press('START');
  document.querySelectorAll('#hints .hint')[1].onclick = () => press('A');
  requestAnimationFrame(pollPad);
})();
