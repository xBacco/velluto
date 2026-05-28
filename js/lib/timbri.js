// Storage locale per i "timbri" (categorie) delle Fantasie.
// Modificabili dall'utente da Impostazioni → Personalizza.
const KEY = 'nostro-spazio:timbri-fantasie';
const DEFAULT = ['intimità', 'sera', 'weekend', 'viaggio', 'sorpresa'];

export function getTimbri() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT];
    return arr.map(s => String(s).trim()).filter(Boolean);
  } catch (_) { return [...DEFAULT]; }
}

export function setTimbri(arr) {
  const clean = (arr || []).map(s => String(s).trim()).filter(Boolean);
  const seen = new Set(); const out = [];
  for (const t of clean) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  localStorage.setItem(KEY, JSON.stringify(out));
}

export function addTimbro(name) {
  const arr = getTimbri();
  arr.push(name);
  setTimbri(arr);
}

export function removeTimbro(name) {
  setTimbri(getTimbri().filter(t => t.toLowerCase() !== name.toLowerCase()));
}

export function renameTimbro(oldName, newName) {
  setTimbri(getTimbri().map(t => t.toLowerCase() === oldName.toLowerCase() ? newName : t));
}
