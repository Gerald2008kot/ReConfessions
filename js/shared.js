// js/shared.js
// ============================================================
// Utilidades compartidas entre feed.js, perfil.js, hilos.js
// ============================================================

const HASHTAG_HS = {
  '#Confesión':      { h: 260, s: 70 }, '#Desamor':         { h:   0, s: 80 },
  '#Traición':       { h:  25, s: 85 }, '#Ruptura':         { h: 330, s: 75 },
  '#Secreto':        { h:  45, s: 90 }, '#Familia':         { h: 145, s: 65 },
  '#Trabajo':        { h: 215, s: 75 }, '#Amistad':         { h: 175, s: 65 },
  '#Vergüenza':      { h: 290, s: 65 }, '#Arrepentimiento': { h:  10, s: 60 },
  '#Felicidad':      { h:  52, s: 85 }, '#Miedo':           { h: 240, s: 65 },
  '#Sueño':          { h: 275, s: 70 }, '#Enojo':           { h:   4, s: 90 },
  '#Nostalgia':      { h: 200, s: 70 },
};

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Devuelve { bg, fg } para un hashtag dado.
 * Cada tag tiene un color HSL único y consistente.
 */
export function tagColor(tag) {
  const e = HASHTAG_HS[tag];
  const h = e ? e.h : hashStr(tag) % 360;
  const s = e ? e.s : 65;
  return {
    bg: `hsla(${h},${s}%,60%,0.13)`,
    fg: `hsl(${h},${Math.min(s + 10, 95)}%,72%)`,
  };
}

/**
 * Construye un mapa { key: count } desde un array de filas.
 */
export function countMap(rows, key) {
  const m = {};
  rows?.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; });
  return m;
}
