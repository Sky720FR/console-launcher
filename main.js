const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const DATA = app.getPath('userData');
const CONFIG = path.join(DATA, 'config.json');
const COVERS = path.join(DATA, 'covers');
const ROM_EXT = ['.xci', '.nsp', '.nsz', '.xcz', '.nca', '.nro', '.nso', '.nup'];

const DEFAULT = {
  style: 's2',              // 's1' = classique, 's2' = nouvelle génération
  theme: 'dark',            // 'dark' | 'light'
  accent: '#00c3e3',
  wallpaper: '',
  userName: 'Joueur',
  avatar: '',
  tileScale: 1,
  sounds: true,
  hideOnLaunch: true,
  // Un émulateur par console ; chaque jeu indique sa console ('s1' ou 's2')
  emulators: {
    // Chemins à renseigner dans Paramètres → Émulateurs (ou dans config.json)
    s1: { name: 'Émulateur Switch 1', path: '', args: ['-f', '-g', '{rom}'] },
    s2: { name: 'Émulateur Switch 2', path: '', args: ['-f', '-g', '{rom}'] }
  },
  romDirs: [],
  // Steam : 'full' = compat. manette complète, 'partial' = complète + partielle, 'all' = tous les jeux
  steam: { enabled: true, filter: 'partial' },
  // Dossiers de jeux PC : chaque sous-dossier = un jeu (on y cherche l'exécutable principal)
  pcDirs: [],
  pcLabels: {},                 // étiquette affichée sur les jeux de chaque dossier (sinon "PC")
  autoCovers: true,
  games: []
};

// Devine la console d'un jeu : les .nup sont des jeux Switch 2, le reste Switch 1
const guessConsole = file => path.extname(file).toLowerCase() === '.nup' ? 's2' : 's1';

const BACKUP = path.join(DATA, 'config.backup.json');

function readJson(file) {
  let t = fs.readFileSync(file, 'utf8');
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  return JSON.parse(t);
}

function loadConfig() {
  let cfg;
  try {
    cfg = { ...structuredClone(DEFAULT), ...readJson(CONFIG) };
  } catch {
    // Fichier abîmé ou absent → on repart de la sauvegarde (jaquettes, noms, réglages conservés)
    try { cfg = { ...structuredClone(DEFAULT), ...readJson(BACKUP) }; }
    catch { return structuredClone(DEFAULT); }
  }
  // Plus de jeux masqués définitivement : tout revient à chaque ouverture
  delete cfg.pcHidden;
  if (cfg.steam) delete cfg.steam.hidden;
  // Ancienne config (un seul émulateur) → devient l'émulateur Switch 2
  if (cfg.emulator) {
    cfg.emulators = { ...structuredClone(DEFAULT.emulators), s2: { name: 'Fritchii', ...cfg.emulator } };
    delete cfg.emulator;
  }
  for (const g of cfg.games) {
    g.console ??= guessConsole(g.path);
    // Image supprimée du disque → on la retélécharge
    if (g.cover && !fs.existsSync(g.cover)) g.cover = '';
    if (g.logo && !fs.existsSync(g.logo)) g.logo = '';
  }
  return cfg;
}
function saveConfig(cfg) {
  fs.mkdirSync(DATA, { recursive: true });
  const json = JSON.stringify(cfg, null, 2);
  // Copie de secours d'abord (si l'écriture principale est interrompue, on la retrouve)
  if (cfg.games.length) fs.writeFileSync(BACKUP, json);
  fs.writeFileSync(CONFIG, json);
}

function cleanTitle(file) {
  return path.basename(file, path.extname(file))
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\+\s*U?\d[\d.]*/gi, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scanDir(dir, depth = 0, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) scanDir(p, depth + 1, out);
    else if (ROM_EXT.includes(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900,
    backgroundColor: '#111',
    autoHideMenuBar: true,
    fullscreen: !process.env.LAUNCHER_SHOT,
    focusable: !process.env.LAUNCHER_SHOT,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: !process.env.LAUNCHER_SHOT }
  });
  win.loadFile('index.html');

  // Mode test : LAUNCHER_SHOT=chemin.png → capture d'écran puis fermeture
  if (process.env.LAUNCHER_SHOT) {
    win.webContents.on('console-message', (_e, _lvl, msg, line, src) => console.log(`[page] ${msg} (${src}:${line})`));
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        if (process.env.LAUNCHER_JS) {
          try { await win.webContents.executeJavaScript(process.env.LAUNCHER_JS); } catch (e) { console.log('[js] ' + e); }
          await new Promise(r => setTimeout(r, 600));
        }
        win.webContents.invalidate(); await new Promise(r => setTimeout(r, 300));
        fs.writeFileSync(process.env.LAUNCHER_SHOT, (await win.webContents.capturePage()).toPNG());
        app.quit();
      }, 1500);
    });
  }
}

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:save', (_e, cfg) => { saveConfig(cfg); return true; });

/* ---------- Steam ---------- */
const STEAM_CACHE = path.join(DATA, 'steam-cache.json');
const NOT_GAMES = /redistributable|steamvr|steamworks|proton|runtime|dedicated server|soundtrack/i;

function steamRoot() {
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf8' });
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return 'C:/Program Files (x86)/Steam';
}

function installedSteamGames() {
  const root = steamRoot();
  let libs = [root];
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    libs = [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'));
  } catch {}
  const games = [];
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      const appid = txt.match(/"appid"\s+"(\d+)"/)?.[1];
      const name = txt.match(/"name"\s+"([^"]+)"/)?.[1];
      if (appid && name && !NOT_GAMES.test(name) && appid !== '228980') games.push({ appid, name });
    }
  }
  return { root, games };
}

/* Profil Steam lu sur le PC (fichiers de Steam) : pseudo public + avatar + temps de jeu.
   Rien n'est envoyé en ligne, aucun mot de passe : on lit seulement ce que Steam a déjà enregistré. */
function steamProfile() {
  const root = steamRoot();
  let txt;
  try { txt = fs.readFileSync(path.join(root, 'config', 'loginusers.vdf'), 'utf8'); } catch { return null; }
  const users = [...txt.matchAll(/"(7656\d{13})"\s*\{([^}]*)\}/g)].map(m => ({
    id64: m[1],
    name: m[2].match(/"PersonaName"\s*"([^"]*)"/)?.[1] || '',
    recent: /"MostRecent"\s*"1"/.test(m[2]),
    ts: +(m[2].match(/"Timestamp"\s*"(\d+)"/i)?.[1] || 0)
  }));
  if (!users.length) return null;
  const u = users.find(x => x.recent) || users.sort((a, b) => b.ts - a.ts)[0];
  const avatar = path.join(root, 'config', 'avatarcache', `${u.id64}.png`);
  const id3 = String(BigInt(u.id64) - 76561197960265728n);
  return { name: u.name, avatar: fs.existsSync(avatar) ? avatar : '', id3, root };
}

// Temps de jeu (minutes) et dernière session (secondes) par jeu, d'après Steam
function steamPlaytime(profile) {
  const out = {};
  if (!profile) return out;
  let txt;
  try { txt = fs.readFileSync(path.join(profile.root, 'userdata', profile.id3, 'config', 'localconfig.vdf'), 'utf8'); } catch { return out; }
  for (const m of txt.matchAll(/"(\d+)"\s*\{/g)) {
    const chunk = txt.slice(m.index, m.index + 1500);
    const end = chunk.search(/\n\s*\}/);
    const block = end > 0 ? chunk.slice(0, end) : chunk;
    const pt = block.match(/"Playtime"\s*"(\d+)"/), lp = block.match(/"LastPlayed"\s*"(\d+)"/);
    if (pt || lp) out[m[1]] = { minutes: +(pt?.[1] || 0), last: +(lp?.[1] || 0) };
  }
  return out;
}

ipcMain.handle('steam:profile', () => {
  const p = steamProfile();
  return p ? { name: p.name, avatar: p.avatar } : null;
});

// Cherche la jaquette dans le cache local de Steam (portrait de préférence)
function steamCover(root, appid) {
  const base = path.join(root, 'appcache', 'librarycache', appid);
  for (const name of ['library_600x900.jpg', 'library_capsule.jpg', 'header.jpg']) {
    const stack = [base];
    while (stack.length) {
      const d = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isDirectory()) stack.push(path.join(d, e.name));
        else if (e.name === name) return path.join(d, e.name);
      }
    }
  }
  return '';
}

// Compatibilité manette d'après la boutique Steam (mise en cache) : 'full' | 'partial' | 'none'
async function controllerSupport(appids) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(STEAM_CACHE, 'utf8')); } catch {}
  for (const id of appids) {
    if (cache[id]) continue;
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic,categories`);
      const d = (await r.json())[id]?.data;
      const cats = (d?.categories || []).map(c => c.id);
      cache[id] = d?.controller_support === 'full' || cats.includes(28) ? 'full'
        : d?.controller_support === 'partial' || cats.includes(18) ? 'partial' : 'none';
    } catch {
      continue; // hors ligne : on réessaiera au prochain scan
    }
  }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(STEAM_CACHE, JSON.stringify(cache, null, 2));
  return cache;
}

async function scanSteam(cfg) {
  const { root, games } = installedSteamGames();
  const support = await controllerSupport(games.map(g => g.appid));
  const ok = s => cfg.steam.filter === 'all' || s === 'full' || (cfg.steam.filter === 'partial' && s === 'partial');

  const wanted = cfg.steam.enabled ? games.filter(g => ok(support[g.appid])) : [];
  const wantedIds = new Set(wanted.map(g => g.appid));
  const before = cfg.games.length;
  // Retire les jeux Steam désinstallés ou qui ne passent plus le filtre
  cfg.games = cfg.games.filter(g => g.console !== 'steam' || wantedIds.has(g.appid));
  const removed = before - cfg.games.length;
  const have = new Set(cfg.games.filter(g => g.console === 'steam').map(g => g.appid));
  const play = steamPlaytime(steamProfile());
  let added = 0;
  for (const g of wanted) {
    const existing = cfg.games.find(x => x.console === 'steam' && x.appid === g.appid);
    const p = play[g.appid] || {};
    if (existing) {
      existing.controller = support[g.appid];
      if (!existing.cover) existing.cover = steamCover(root, g.appid);
      existing.playtime = p.minutes || 0;
      // la dernière session Steam compte aussi pour trier par "joué récemment"
      existing.lastPlayed = Math.max(existing.lastPlayed || 0, (p.last || 0) * 1000);
      continue;
    }
    if (have.has(g.appid)) continue;
    cfg.games.push({
      id: 'steam' + g.appid, title: g.name, path: `steam://rungameid/${g.appid}`, appid: g.appid,
      console: 'steam', controller: support[g.appid], cover: steamCover(root, g.appid),
      playtime: p.minutes || 0, lastPlayed: (p.last || 0) * 1000
    });
    added++;
  }
  return { added, removed };
}

/* ---------- Jeux PC (dossiers d'exécutables) ---------- */
const SKIP_DIRS = /^(_commonredist|redist|rom switch|directx|support|vortex)$/i;  // vortex = gestionnaire de mods
const SKIP_EXE = /unitycrash|crashhandler|crashreport|uninstall|unins\d|setup|redist|vcredist|dxwebsetup|oalinst|dotnet|hotfix|ue4prereq|easyanticheat|launcherhelper|notification_helper|wdapp|^vortex\.exe$/i;  // Vortex = gestionnaire de mods, pas un jeu
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function pcTitle(folder) {
  return folder.replace(/-[a-z0-9]+\.(com|net|org)$/i, '')   // retire un éventuel suffixe "-site.com"
    .replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function exesIn(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name))
      .map(e => path.join(dir, e.name));
  } catch { return []; }
}

// Choisit l'exe principal : celui qui ressemble au nom du dossier, sinon le plus gros
function mainExe(dir, title, depth = 0) {
  let exes = exesIn(dir);
  if (!exes.length && depth < 2) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !SKIP_DIRS.test(e.name)) {
        const found = mainExe(path.join(dir, e.name), title, depth + 1);
        if (found) return found;
      }
    }
    return '';
  }
  const t = norm(title);
  const named = exes.find(x => { const n = norm(path.basename(x, '.exe')); return n && (t.includes(n) || n.includes(t)); });
  if (named) return named;
  return exes.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] || '';
}

function scanPc(cfg) {
  const known = new Set(cfg.games.map(g => path.normalize(g.path).toLowerCase()));
  const titles = new Set(cfg.games.filter(g => g.console === 'pc').map(g => norm(g.title)));

  let added = 0;
  for (const root of cfg.pcDirs || []) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !SKIP_DIRS.test(e.name)); } catch { continue; }
    for (const d of dirs) {
      const title = pcTitle(d.name);
      if (titles.has(norm(title))) continue;            // doublon (ex : dossier extrait deux fois)
      const exe = mainExe(path.join(root, d.name), title);
      if (!exe || known.has(path.normalize(exe).toLowerCase())) continue;
      let appid = '';
      try { appid = fs.readFileSync(path.join(root, d.name, 'steam_appid.txt'), 'utf8').trim(); } catch {}
      cfg.games.push({ id: 'pc' + Date.now().toString(36) + added, title, path: exe, console: 'pc', appid, cover: '', lastPlayed: 0 });
      titles.add(norm(title)); known.add(path.normalize(exe).toLowerCase());
      added++;
    }
  }
  return added;
}

/* ---------- Jaquettes automatiques ---------- */
async function download(url, dest) {
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    fs.mkdirSync(COVERS, { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return dest;
  } catch { return ''; }
}

// Switch : image carrée de l'eShop européen, recherchée par titre
async function switchCover(g) {
  const q = encodeURIComponent(g.title);
  try {
    const r = await fetch(`https://searching.nintendo-europe.com/fr/select?q=${q}&fq=type:GAME&rows=10&wt=json`);
    const docs = (await r.json()).response.docs.filter(d => d.image_url_sq_s);
    const t = norm(g.title);
    const best = docs.find(d => norm(d.title) === t) || docs.find(d => norm(d.title).includes(t) || t.includes(norm(d.title))) || docs[0];
    if (!best) return '';
    return download(best.image_url_sq_s, path.join(COVERS, `sw-${norm(g.title)}.jpg`));
  } catch { return ''; }
}

// PC : jaquette Steam (via steam_appid.txt ou recherche du titre sur la boutique)
async function pcCover(g) {
  let id = g.appid;
  if (!id) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(g.title)}&cc=fr&l=french`);
      const items = (await r.json()).items || [];
      const t = norm(g.title);
      id = String((items.find(i => norm(i.name) === t) || items.find(i => norm(i.name).startsWith(t)) || items[0])?.id || '');
    } catch {}
  }
  if (!id) return '';
  g.appid = id;
  const dest = path.join(COVERS, `pc-${id}.jpg`);
  // Jeux récents : les images ont une adresse avec un code, qu'on obtient via l'API de la boutique
  const a = await steamAssets(id);
  for (const key of ['library_capsule_2x', 'library_capsule', 'header']) {
    if (a?.[key]) {
      const f = await download(a.url(a[key]), dest);
      if (f) return f;
    }
  }
  // Anciens jeux : adresse classique
  for (const img of ['library_600x900.jpg', 'header.jpg']) {
    const f = await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${img}`, dest);
    if (f) return f;
  }
  return '';
}

async function steamAssets(appid) {
  try {
    const input = { ids: [{ appid: +appid }], context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true } };
    const j = await (await fetch('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input)))).json();
    const a = j.response?.store_items?.[0]?.assets;
    if (!a) return null;
    a.url = file => 'https://shared.cloudflare.steamstatic.com/store_item_assets/' + a.asset_url_format.replace('${FILENAME}', file);
    return a;
  } catch { return null; }
}

/* ---------- Logos transparents (si aucune jaquette) ---------- */
// 1) logo Steam (jeux avec un appid)  2) SteamGridDB si une clé API est renseignée
async function findLogo(g, cfg) {
  const dest = path.join(COVERS, `logo-${norm(g.title)}.png`);
  if (g.appid) {
    const f = await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/logo.png`, dest);
    if (f) return f;
  }
  if (cfg.sgdbKey) {
    const headers = { Authorization: `Bearer ${cfg.sgdbKey}` };
    try {
      const s = await (await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(g.title)}`, { headers })).json();
      const gameId = s.data?.[0]?.id;
      if (gameId) {
        const l = await (await fetch(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}?styles=official,white,custom&types=static`, { headers })).json();
        const url = l.data?.find(x => /\.png$/i.test(x.url))?.url;
        if (url) return download(url, dest);
      }
    } catch {}
  }
  return '';
}

async function autoCovers(cfg) {
  if (!cfg.autoCovers) return 0;
  let n = 0;
  for (const g of cfg.games) {
    // Jeu sans image → on réessaie à chaque ouverture jusqu'à en trouver une
    if (!g.cover) {
      g.cover = g.console === 'pc' || g.console === 'steam' ? await pcCover(g) : await switchCover(g);
      if (g.cover) n++;
    }
    // Toujours rien → on cherche au moins un logo transparent
    if (!g.cover && !g.logo) {
      g.logo = await findLogo(g, cfg);
      if (g.logo) n++;
    }
  }
  return n;
}

/* ---------- Recherche manuelle d'une image ---------- */
async function coverCandidates(consoleKey, term) {
  const out = [];
  const q = encodeURIComponent(term);
  if (consoleKey === 's1' || consoleKey === 's2') {
    try {
      const r = await fetch(`https://searching.nintendo-europe.com/fr/select?q=${q}&fq=type:GAME&rows=12&wt=json`);
      for (const d of (await r.json()).response.docs) {
        if (d.image_url_sq_s) out.push({ url: d.image_url_sq_s, label: d.title });
        if (d.image_url) out.push({ url: d.image_url, label: d.title + ' (large)' });
      }
    } catch {}
  } else {
    try {
      const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${q}&cc=fr&l=french`);
      const items = ((await r.json()).items || []).slice(0, 5);
      for (const it of items) {
        const a = await steamAssets(it.id);
        const keys = ['library_capsule_2x', 'header', 'library_hero', 'main_capsule'];
        const found = a ? keys.filter(k => a[k]) : [];
        for (const k of found) out.push({ url: a.url(a[k]), label: it.name });
        if (!found.length) out.push({ url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.id}/header.jpg`, label: it.name });
      }
    } catch {}
  }
  return out;
}

ipcMain.handle('cover:search', (_e, consoleKey, term) => coverCandidates(consoleKey, term));
ipcMain.handle('cover:pick', (_e, url) => download(url, path.join(COVERS, `pick-${Date.now()}.jpg`)));

ipcMain.handle('roms:scan', async () => {
  const cfg = loadConfig();
  const known = new Set(cfg.games.map(g => path.normalize(g.path).toLowerCase()));
  let added = 0;
  for (const dir of cfg.romDirs) {
    for (const file of scanDir(dir)) {
      if (known.has(path.normalize(file).toLowerCase())) continue;
      cfg.games.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: cleanTitle(file), path: file, console: guessConsole(file), cover: '', lastPlayed: 0 });
      known.add(path.normalize(file).toLowerCase());
      added++;
    }
  }
  let removed = 0;
  try {
    const s = await scanSteam(cfg);
    added += s.added; removed = s.removed;
  } catch (e) { console.log('Steam :', e); }
  added += scanPc(cfg);
  saveConfig(cfg);             // la liste s'affiche tout de suite…
  if (await autoCovers(cfg)) saveConfig(cfg);  // …puis les jaquettes se téléchargent
  return { cfg, added, removed };
});

ipcMain.handle('dialog:file', async (_e, kind) => {
  const filters = kind === 'image'
    ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    : kind === 'exe' ? [{ name: 'Programme', extensions: ['exe'] }]
    : [{ name: 'Jeux', extensions: ROM_EXT.map(x => x.slice(1)) }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// Copie une image dans le dossier de l'appli pour qu'elle reste dispo
ipcMain.handle('image:import', (_e, src) => {
  fs.mkdirSync(COVERS, { recursive: true });
  const dest = path.join(COVERS, Date.now() + path.extname(src));
  fs.copyFileSync(src, dest);
  return dest;
});

ipcMain.handle('game:launch', async (_e, romPath, consoleKey) => {
  const cfg = loadConfig();
  if (consoleKey === 'steam') {
    if (process.env.LAUNCHER_SHOT) { console.log('[test] lancement Steam ignoré :', romPath); return { ok: true }; }
    // Steam ouvre le jeu par-dessus le menu ; le menu réapparaît quand on quitte le jeu
    await shell.openExternal(romPath);
    return { ok: true };
  }
  const isPc = consoleKey === 'pc';
  const emu = isPc ? { path: romPath, args: [] } : cfg.emulators[consoleKey || (romPath ? guessConsole(romPath) : 's2')];
  const exe = emu?.path;
  if (!exe || !fs.existsSync(exe)) return { ok: false, error: `${isPc ? 'Jeu' : 'Émulateur'} introuvable : ${exe}` };
  if (process.env.LAUNCHER_SHOT) { console.log('[test] lancement ignoré :', exe, romPath); return { ok: true }; }
  const args = romPath && !isPc
    ? emu.args.map(a => a.replace('{rom}', romPath))
    : [];
  const child = spawn(exe, args, { cwd: path.dirname(exe), detached: false, stdio: 'ignore' });
  child.on('error', err => win?.webContents.send('game:error', String(err)));
  if (cfg.hideOnLaunch) {
    win.setFullScreen(false);
    win.minimize();
    child.on('exit', () => {
      win.restore();
      win.setFullScreen(true);
      win.focus();
      win.webContents.send('game:exit');
    });
  }
  return { ok: true };
});

// Réglages manette : Steam (steam://) ou panneau Windows des contrôleurs de jeu
ipcMain.handle('pads:open', async (_e, what) => {
  if (process.env.LAUNCHER_SHOT) return { ok: true };
  // Émulateurs : on les ouvre directement sur la page "Controls" (script d'automatisation Windows)
  if (what === 's1' || what === 's2') {
    const exe = loadConfig().emulators[what]?.path;
    if (!exe || !fs.existsSync(exe)) return { ok: false, error: `Émulateur introuvable : ${exe}` };
    // Dans la version .exe, le script est sorti de l'archive (app.asar.unpacked) pour que PowerShell puisse le lire
    const script = path.join(__dirname, 'open-controls.ps1').replace('app.asar', 'app.asar.unpacked');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', script, '-Exe', exe, '-Wait'], { windowsHide: true, stdio: 'ignore' });
    // Le menu se réduit pour laisser la place, puis revient quand l'émulateur est fermé
    win.setFullScreen(false);
    win.minimize();
    child.on('exit', () => { win.restore(); win.setFullScreen(true); win.focus(); });
    return { ok: true };
  }
  try {
    if (what === 'steam') await shell.openExternal('steam://open/settings/controller');
    if (what === 'windows') spawn('control.exe', ['joy.cpl'], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:fullscreen', () => win.setFullScreen(!win.isFullScreen()));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
