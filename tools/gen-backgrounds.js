// Génère les fonds d'écran des styles (dessins originaux, pas de logos ni de personnages).
// Usage : node tools/gen-backgrounds.js   → écrit backgrounds/*.svg
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'backgrounds');
fs.mkdirSync(OUT, { recursive: true });

const W = 1600, H = 900;
// Générateur pseudo-aléatoire reproductible (les fonds sont identiques à chaque génération)
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
const svg = (body, defs = '', extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" ${extra}>` +
  (defs ? `<defs>${defs}</defs>` : '') + body + '</svg>';
const save = (name, s) => { fs.writeFileSync(path.join(OUT, name + '.svg'), s); console.log('écrit', name); };
const f = n => Math.round(n * 10) / 10;

/* ---------------- NES : nuit en pixel art, montagnes en escalier, sol en briques ---------------- */
(() => {
  const r = rng(8);
  const P = 10; // taille d'un "pixel"
  let b = `<rect width="${W}" height="${H}" fill="#0c0c18"/>`;
  // ciel en bandes (dégradé façon 8 bits, palette limitée)
  ['#0c0c18', '#10102a', '#16163a', '#1e1a4a'].forEach((c, i) => { b += `<rect y="${i * 120}" width="${W}" height="120" fill="${c}"/>`; });
  // étoiles
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * W / P) * P, y = Math.floor(r() * 420 / P) * P;
    b += `<rect x="${x}" y="${y}" width="${P / 2}" height="${P / 2}" fill="${r() > .8 ? '#fcfc54' : '#fcfcfc'}" opacity="${f(.4 + r() * .6)}"/>`;
  }
  // pleine lune en pixels, avec quelques cratères (o)
  const moon = ['...XXXX...', '.XXXXXXXX.', '.XXoXXXXX.', 'XXXXXXXoXX', 'XXXXXXXXXX', 'XXoXXXXXXX', 'XXXXXoXXXX', '.XXXXXXXX.', '.XXXXXXXX.', '...XXXX...'];
  moon.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') b += `<rect x="${1280 + i * P}" y="${90 + j * P}" width="${P}" height="${P}" fill="${ch === 'o' ? '#d8bc78' : '#fce4a0'}"/>`;
  }));
  // montagnes en escalier (3 plans)
  const ridge = (base, amp, color, seed) => {
    const rr = rng(seed); let x = 0, y = base, d = `M0 ${H} L0 ${base}`;
    while (x < W) { const w = (2 + Math.floor(rr() * 5)) * P; y = Math.max(base - amp, Math.min(base, y + (rr() > .5 ? P * 2 : -P * 2))); d += ` L${x} ${y} L${x + w} ${y}`; x += w; }
    return `<path d="${d} L${W} ${H} Z" fill="${color}" shape-rendering="crispEdges"/>`;
  };
  b += ridge(560, 220, '#2a1f5a', 3) + ridge(640, 160, '#3a1430', 5) + ridge(720, 90, '#5a1018', 9);
  // sol en briques
  for (let y = 780; y < H; y += 30) for (let x = (y / 30) % 2 ? -30 : 0; x < W; x += 60) {
    b += `<rect x="${x}" y="${y}" width="58" height="28" fill="#8c3418"/><rect x="${x}" y="${y}" width="58" height="4" fill="#c86c3c"/>`;
  }
  b += `<rect y="772" width="${W}" height="8" fill="#000"/>`;
  save('nes', svg(b, '', 'shape-rendering="crispEdges"'));
})();

/* ---------------- Super Nintendo : collines douces 16 bits, nuages, 4 boutons géants estompés ---------------- */
(() => {
  const r = rng(16);
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9b2e6"/><stop offset=".6" stop-color="#e2def4"/><stop offset="1" stop-color="#f3f1fa"/></linearGradient>
  <pattern id="dith" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#000" opacity=".08"/><rect x="2" y="2" width="2" height="2" fill="#000" opacity=".08"/></pattern>`;
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  // nuages arrondis "pixel"
  for (let i = 0; i < 7; i++) {
    const x = r() * W, y = 60 + r() * 260, s = .6 + r() * .8;
    b += `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})" fill="#fff" opacity=".85"><rect x="0" y="20" width="160" height="36" rx="18"/><rect x="30" y="0" width="70" height="50" rx="25"/><rect x="80" y="8" width="60" height="44" rx="22"/></g>`;
  }
  // collines superposées avec tramage
  const hill = (y0, amp, freq, phase, color) => {
    let d = `M0 ${H} L0 ${y0}`;
    for (let x = 0; x <= W; x += 20) d += ` L${x} ${f(y0 - amp * Math.sin(x / freq + phase) - amp * .4 * Math.sin(x / (freq * .43) + phase * 2))}`;
    d += ` L${W} ${H} Z`;
    return `<path d="${d}" fill="${color}"/><path d="${d}" fill="url(#dith)"/>`;
  };
  b += hill(600, 50, 230, 1, '#9b93cf') + hill(680, 40, 180, 3, '#7d73b8') + hill(770, 30, 140, 5, '#5b4a9e');
  // 4 boutons d'action en losange, très estompés
  const cx = 1340, cy = 250, R = 70, d = 120;
  [[0, -d, '#3b6fd8'], [d, 0, '#d83b3b'], [0, d, '#e8c21c'], [-d, 0, '#2fa84f']].forEach(([dx, dy, c]) => {
    b += `<circle cx="${cx + dx}" cy="${cy + dy}" r="${R}" fill="${c}" opacity=".16"/><circle cx="${cx + dx - 18}" cy="${cy + dy - 18}" r="${R * .35}" fill="#fff" opacity=".12"/>`;
  });
  save('snes', svg(b, defs));
})();

/* ---------------- Nintendo 64 : maillage low-poly sombre + 4 faisceaux de couleur ---------------- */
(() => {
  const r = rng(64);
  const cols = 18, rows = 11, pts = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const jitter = (i && j && i < cols && j < rows) ? 1 : 0;
    pts.push([i * W / cols + (r() - .5) * 60 * jitter, j * H / rows + (r() - .5) * 60 * jitter]);
  }
  const P = (i, j) => pts[j * (cols + 1) + i];
  let b = `<rect width="${W}" height="${H}" fill="#111"/>`;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const [a, c, e, g] = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    for (const tri of [[a, c, e], [a, e, g]]) {
      const l = 14 + Math.floor(r() * 16) + Math.floor((j / rows) * 8);
      b += `<polygon points="${tri.map(p => p.map(f).join(',')).join(' ')}" fill="rgb(${l},${l},${l + 4})" stroke="#000" stroke-opacity=".25"/>`;
    }
  }
  const defs = ['#e5161d', '#f8c400', '#079f3d', '#0a3fa8'].map((c, i) =>
    `<linearGradient id="beam${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".5" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`).join('');
  ['#e5161d', '#f8c400', '#079f3d', '#0a3fa8'].forEach((c, i) => {
    b += `<polygon points="${-200 + i * 140},${H} ${200 + i * 140},${H} ${1200 + i * 140},0 ${1060 + i * 140},0" fill="url(#beam${i})"/>`;
  });
  b += `<rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  save('n64', svg(b, defs + `<radialGradient id="vig"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>`));
})();

/* ---------------- GameCube : cubes isométriques violets qui flottent ---------------- */
(() => {
  const r = rng(2001);
  const defs = `<radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#5a44c0"/><stop offset=".55" stop-color="#2c2068"/><stop offset="1" stop-color="#140d30"/></radialGradient>`;
  let b = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const cube = (x, y, s, o) => {
    const h = s * .58;
    const top = `${x},${y - h} ${x + s},${y - h * 2} ${x + 2 * s},${y - h} ${x + s},${y}`;
    const left = `${x},${y - h} ${x + s},${y} ${x + s},${y + s * 1.1} ${x},${y + s * 1.1 - h}`;
    const right = `${x + s},${y} ${x + 2 * s},${y - h} ${x + 2 * s},${y + s * 1.1 - h} ${x + s},${y + s * 1.1}`;
    return `<g opacity="${f(o)}"><polygon points="${top}" fill="#b9a6ff"/><polygon points="${left}" fill="#6e55d6"/><polygon points="${right}" fill="#4a35a8"/></g>`;
  };
  const list = [];
  for (let i = 0; i < 26; i++) list.push([r() * W, r() * H, 14 + r() * 70, .12 + r() * .45]);
  list.sort((a, b2) => a[2] - b2[2]).forEach(([x, y, s, o]) => { b += cube(f(x), f(y), f(s), o); });
  // halo central
  b += `<circle cx="${W / 2}" cy="${H * .42}" r="380" fill="#8a6cf0" opacity=".10"/>`;
  save('cube', svg(b, defs));
})();

/* ---------------- Nintendo DS : rayures, deux écrans en filigrane, traits de stylet ---------------- */
(() => {
  const r = rng(2004);
  let b = `<rect width="${W}" height="${H}" fill="#e6e6e6"/>`;
  for (let x = 0; x < W; x += 36) b += `<rect x="${x}" width="18" height="${H}" fill="#dcdcdc"/>`;
  // console ouverte en filigrane (deux écrans + charnière)
  b += `<g transform="translate(1180 150) rotate(-8)" fill="none" stroke="#c4c4c4" stroke-width="6">
    <rect x="0" y="0" width="360" height="250" rx="22"/><rect x="40" y="30" width="280" height="190" rx="6" fill="#d2d2d2" stroke="none"/>
    <rect x="-10" y="262" width="380" height="18" rx="9" fill="#d0d0d0" stroke="none"/>
    <rect x="0" y="292" width="360" height="250" rx="22"/><rect x="70" y="322" width="220" height="165" rx="6" fill="#d2d2d2" stroke="none"/>
    <circle cx="35" cy="380" r="16"/><circle cx="325" cy="380" r="16"/></g>`;
  // gribouillis de stylet (traits orange et gris)
  for (let k = 0; k < 6; k++) {
    let x = r() * 900, y = 120 + r() * 650, d = `M${f(x)} ${f(y)}`;
    for (let i = 0; i < 6; i++) { const cx = x + (r() - .5) * 260, cy = y + (r() - .5) * 180; x += (r() - .3) * 160; y += (r() - .5) * 90; d += ` Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`; }
    b += `<path d="${d}" fill="none" stroke="${k % 2 ? '#ff8a00' : '#bdbdbd'}" stroke-opacity="${k % 2 ? .35 : .6}" stroke-width="${3 + r() * 4}" stroke-linecap="round"/>`;
  }
  save('ds', svg(b));
})();

/* ---------------- Wii : blanc lumineux, lignes fines, bulles douces, vague bleue ---------------- */
(() => {
  const r = rng(2006);
  const defs = `<radialGradient id="bub" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#e3f6fd"/><stop offset="1" stop-color="#bfe8f9"/></radialGradient>
  <linearGradient id="wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34bdf0" stop-opacity=".35"/><stop offset="1" stop-color="#34bdf0" stop-opacity="0"/></linearGradient>`;
  let b = `<rect width="${W}" height="${H}" fill="#f6f6f6"/>`;
  for (let y = 0; y < H; y += 6) b += `<rect y="${y}" width="${W}" height="3" fill="#ececec"/>`;
  for (let i = 0; i < 22; i++) {
    const R = 10 + r() * 60;
    b += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(R)}" fill="url(#bub)" opacity="${f(.35 + r() * .45)}" stroke="#bfe8f9"/>`;
  }
  b += `<path d="M0 760 C 300 700 520 820 800 760 S 1300 690 1600 750 L1600 900 L0 900 Z" fill="url(#wave)"/>`;
  b += `<path d="M0 760 C 300 700 520 820 800 760 S 1300 690 1600 750" fill="none" stroke="#34bdf0" stroke-opacity=".5" stroke-width="3"/>`;
  save('wii', svg(b, defs));
})();

/* ---------------- Nintendo 3DS : sol quadrillé en perspective, formes 3D qui flottent ---------------- */
(() => {
  const r = rng(2011);
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eaf7fd"/></linearGradient>
  <radialGradient id="sph" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9fe3fa"/><stop offset="1" stop-color="#2ac4f4"/></radialGradient>`;
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  const hz = 430, vx = W / 2;
  for (let i = -20; i <= 20; i++) b += `<line x1="${vx}" y1="${hz}" x2="${vx + i * 140}" y2="${H}" stroke="#cfeaf5" stroke-width="2"/>`;
  for (let k = 1; k < 14; k++) { const y = hz + Math.pow(k / 13, 2.2) * (H - hz); b += `<line x1="0" y1="${f(y)}" x2="${W}" y2="${f(y)}" stroke="#cfeaf5" stroke-width="2"/>`; }
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = 80 + r() * 380, R = 18 + r() * 50;
    b += `<ellipse cx="${f(x)}" cy="${f(hz + 30 + (y / 460) * 300)}" rx="${f(R)}" ry="${f(R * .25)}" fill="#2ac4f4" opacity=".10"/>`;
    b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="url(#sph)" opacity=".55"/>`;
  }
  save('p3d', svg(b, defs));
})();

/* ---------------- Wii U : blanc doux, taches de couleur floues, points, tablette en filigrane ---------------- */
(() => {
  const r = rng(2012);
  const colors = ['#14b4e6', '#7ad3f2', '#ffd36b', '#ff8fb1', '#9be37a'];
  let defs = `<filter id="blur"><feGaussianBlur stdDeviation="60"/></filter>
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2" fill="#c9d3dc"/></pattern>`;
  let b = `<rect width="${W}" height="${H}" fill="#f1f4f7"/><g filter="url(#blur)">`;
  for (let i = 0; i < 7; i++) b += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(120 + r() * 160)}" fill="${colors[i % colors.length]}" opacity=".28"/>`;
  b += `</g><rect width="${W}" height="${H}" fill="url(#dots)" opacity=".7"/>`;
  b += `<g transform="translate(1150 560) rotate(-6)" fill="none" stroke="#cdd6de" stroke-width="6">
    <rect width="420" height="250" rx="40"/><rect x="85" y="30" width="250" height="160" rx="6" fill="#dde4ea" stroke="none"/>
    <circle cx="45" cy="80" r="20"/><circle cx="375" cy="80" r="20"/></g>`;
  save('wiiu', svg(b, defs));
})();
