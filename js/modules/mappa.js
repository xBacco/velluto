/* global L */
import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  aggregaPerMese, totaliLuoghi, luoghiDelMese, cuoriLabel, etichettaData, nomeMese,
} from '../lib/logic.js';
import { listLuoghi, addLuogo, updateLuogo, deleteLuogo, listFoto, signedUrl } from '../store.js';
import { fotoEditor, loadThumbsInto } from './foto.js';

const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const CENTRO_IT = [42.5, 12.5];

let ctx = null;
let luoghi = [];
let map = null;
let statView = 'vis';

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function renderMappa(context) {
  ctx = context;
  try { luoghi = await listLuoghi(ctx.client, ctx.me.couple_id); }
  catch (err) { toast('Errore caricamento: ' + err.message, 'err'); luoghi = []; }
  draw();
}

function handleLabel() {
  const t = totaliLuoghi(luoghi);
  return `📊 Statistiche · ${t.luoghi} luoghi · ${t.volte} volte 🔥`;
}

function draw() {
  const p = ctx.panel; clear(p);
  if (map) { map.remove(); map = null; }
  add(p, mk('h2', 'ptitle', '🗺️ La nostra mappa'),
         mk('p', 'psub', 'I posti che ci portiamo dietro.'));
  const area = mk('div', 'mappa-area');
  const mapEl = mk('div', 'mappa-map');
  const handle = mk('div', 'mappa-handle');
  add(handle, mk('div', 'mappa-grab'), mk('div', 'mappa-hlabel', handleLabel()));
  handle.onclick = openStats;
  add(area, mapEl, handle);
  add(p, area);
  initMap(mapEl);
}

function pinIcon() {
  const e = mk('div', 'mappa-pin'); add(e, mk('span', null, '📍'));
  return L.divIcon({ className: '', html: e, iconSize: [30, 30], iconAnchor: [15, 30] });
}

function initMap(mapEl) {
  map = L.map(mapEl, { zoomControl: false }).setView(CENTRO_IT, 5.2);
  L.tileLayer(TILE_DARK, { attribution: '© OpenStreetMap, © CARTO', maxZoom: 19 }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  for (const l of luoghi) {
    const marker = L.marker([l.lat, l.lng], { icon: pinIcon() }).addTo(map);
    marker.on('click', () => openDetail(l));
  }
  setTimeout(() => map.invalidateSize(), 80);
}

// ---- STATISTICHE (drawer = sheet riusata) ----
function openStats() {
  openSheet('La nostra mappa', sheet => {
    const host = mk('div', 'mappa-stats');
    sheet.appendChild(host);
    renderStatsInto(host);
  });
}

function renderStatsInto(host) {
  clear(host);
  host.className = 'mappa-stats ' + (statView === 'vis' ? 'as-vis' : 'as-fat');
  const c = aggregaPerMese(luoghi);
  const arr = statView === 'vis' ? c.vis : c.fat;
  const max = Math.max(...arr, 1);
  const tot = arr.reduce((a, b) => a + b, 0);
  const mesiAttivi = arr.filter(x => x).length;

  const sw = mk('div', 'mst-sw');
  const bv = mk('button', statView === 'vis' ? 'on' : null, '📍 Siamo stati');
  bv.onclick = () => { statView = 'vis'; renderStatsInto(host); };
  const bf = mk('button', statView === 'fat' ? 'on' : null, '🔥 Fatto qui');
  bf.onclick = () => { statView = 'fat'; renderStatsInto(host); };
  add(sw, bv, bf); add(host, sw);

  add(host, mk('div', 'mst-tot', statView === 'vis'
    ? `In totale: ${tot} luoghi in ${mesiAttivi} mesi`
    : `In totale: ${tot} volte in ${mesiAttivi} mesi`));

  const chart = mk('div', 'mst-chart');
  for (let i = 0; i < 12; i++) {
    const col = mk('div', 'mst-col');
    col.onclick = () => renderMonthInto(host, i);
    add(col, mk('div', 'mst-num' + (arr[i] ? '' : ' z'), String(arr[i])));
    const bar = mk('div', 'mst-bar' + (arr[i] ? '' : ' z'));
    bar.style.height = (arr[i] ? Math.round(arr[i] / max * 112) + 6 : 4) + 'px';
    add(col, bar); add(chart, col);
  }
  add(host, chart);
  const labels = mk('div', 'mst-labels');
  for (let i = 0; i < 12; i++) add(labels, mk('div', null, MESI[i]));
  add(host, labels);
  add(host, mk('div', 'mst-hint', 'tocca un mese per vedere i posti'));
}

function mprow(l) {
  const r = mk('div', 'mst-mrow');
  const info = mk('div');
  add(info, mk('div', 'mst-mnm', l.nome), mk('div', 'mst-mct', l.citta || ''));
  add(r, info);
  r.onclick = () => openDetail(l);
  return r;
}

function renderMonthInto(host, m) {
  clear(host);
  const { visited, fatto } = luoghiDelMese(luoghi, m);
  const h = mk('div', 'mst-mhead');
  const bk = mk('button', 'mst-back', '←'); bk.onclick = () => renderStatsInto(host);
  add(h, bk, mk('span', null, nomeMese(m)));
  add(host, h);
  const v = mk('div', 'mst-msec v');
  add(v, mk('div', 'mst-lbl', `📍 Dove siamo stati (${visited.length})`));
  if (visited.length) for (const l of visited) add(v, mprow(l));
  else add(v, mk('div', 'mst-empty', 'Nessun posto questo mese.'));
  add(host, v);
  const f = mk('div', 'mst-msec f');
  add(f, mk('div', 'mst-lbl', `🔥 Dove l'abbiamo fatto (${fatto.length})`));
  if (fatto.length) for (const l of fatto) add(f, mprow(l));
  else add(f, mk('div', 'mst-empty', 'Niente di piccante… per ora.'));
  add(host, f);
}

// ---- SCHEDA LUOGO (polaroid) ----
async function loadCover(l, img) {
  try {
    const foto = await listFoto(ctx.client, { contesto: 'luogo', refId: l.id });
    if (!foto.length) { img.classList.add('mappa-noimg'); return; }
    img.src = await signedUrl(ctx.client, foto[0].storage_path);
  } catch { img.classList.add('mappa-noimg'); }
}

function openDetail(l) {
  const ov = mk('div', 'modal on');
  const stage = mk('div', 'mappa-stage');
  const pol = mk('div', 'mappa-pol');
  const inner = mk('div', 'mappa-pol-inner');

  const front = mk('div', 'mappa-face mappa-front');
  const img = mk('img', 'mappa-pimg'); img.alt = '';
  loadCover(l, img);
  add(front, img);
  const cap = mk('div', 'mappa-cap');
  add(cap, mk('div', 'mappa-nm', l.nome), mk('div', 'mappa-dt', etichettaData(l.data_evento)));
  add(front, cap);

  const back = mk('div', 'mappa-face mappa-back');
  if (l.intimo) {
    const st = mk('div', 'mappa-stamp');
    add(st, mk('span', null, 'FATTO'), mk('br'), mk('span', null, 'QUI'));
    add(back, st);
  }
  add(back, mk('div', 'mappa-bnm', l.nome),
            mk('div', 'mappa-added', 'Aggiunta il ' + etichettaData(l.creato, { conGiorno: true })));
  if (l.intimo) add(back, mk('div', 'mappa-hearts', cuoriLabel(l.voto)));
  add(back, mk('div', 'mappa-bdesc', l.descrizione || ''));
  const strip = mk('div', 'mappa-bstrip');
  loadThumbsInto(ctx, { contesto: 'luogo', refId: l.id }, strip, false).catch(() => {});
  add(back, strip);

  add(inner, front, back);
  add(pol, inner); add(stage, pol);

  const tools = mk('div', 'mappa-tools');
  const flip = mk('button', 'mappa-tbtn primary', '↻ Gira');
  flip.onclick = () => { pol.classList.toggle('flip'); flip.textContent = pol.classList.contains('flip') ? '↺ Fronte' : '↻ Gira'; };
  const edit = mk('button', 'mappa-tbtn', '✎ Modifica');
  edit.onclick = () => { ov.remove(); openEdit(l); };
  const close = mk('button', 'mappa-tbtn', '✕ Chiudi');
  close.onclick = () => ov.remove();
  add(tools, flip, edit, close);

  add(ov, stage, tools);
  const fx = mk('div', 'mappa-flash'); add(ov, fx); setTimeout(() => fx.remove(), 450);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ---- FORM (campi condivisi) ----
function field(label, input) {
  const f = mk('div', 'mappa-field');
  add(f, mk('label', null, label), input);
  return f;
}

function votoSelector(initial) {
  const wrap = mk('div', 'mappa-voto');
  let v = initial || 0;
  const cuori = [];
  const paint = () => cuori.forEach((c, i) => { c.textContent = i < v ? '❤' : '♡'; });
  for (let i = 0; i < 5; i++) {
    const c = mk('span', 'mappa-cuore');
    c.onclick = () => { v = i + 1; paint(); };
    cuori.push(c); wrap.appendChild(c);
  }
  paint();
  return { el: wrap, get: () => v };
}

function openEdit(l) {
  openSheet('Modifica luogo', sheet => {
    const nome = mk('input'); nome.value = l.nome;
    const citta = mk('input'); citta.value = l.citta || '';
    const data = mk('input'); data.type = 'date'; data.value = l.data_evento || todayISO();
    const intimo = mk('input'); intimo.type = 'checkbox'; intimo.checked = !!l.intimo;
    const intimoRow = mk('label', 'mappa-check'); add(intimoRow, intimo, mk('span', null, " L'abbiamo fatto qui 🔥"));
    const voto = votoSelector(l.voto);
    const votoRow = mk('div', 'mappa-field'); add(votoRow, mk('label', null, 'Quanto è stato bello'), voto.el);
    votoRow.style.display = l.intimo ? '' : 'none';
    intimo.onchange = () => { votoRow.style.display = intimo.checked ? '' : 'none'; };
    const desc = mk('textarea'); desc.value = l.descrizione || '';
    const foto = fotoEditor(ctx, { contesto: 'luogo', refId: l.id });

    const save = mk('button', 'btn', 'Salva');
    save.onclick = async () => {
      if (!nome.value.trim()) { toast('Serve un nome', 'err'); return; }
      try {
        await updateLuogo(ctx.client, l.id, {
          nome: nome.value.trim(), citta: citta.value.trim(), intimo: intimo.checked,
          voto: voto.get(), descrizione: desc.value.trim(), data_evento: data.value,
        });
        await foto.flush(l.id);
        sheet.closest('.modal').remove();
        toast('Salvato');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };
    const del = mk('button', 'mappa-del', 'Elimina luogo');
    del.onclick = async () => {
      try {
        await deleteLuogo(ctx.client, l.id);
        sheet.closest('.modal').remove();
        toast('Eliminato');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };

    add(sheet, field('Nome', nome), field('Città', citta), field('Quando', data),
      intimoRow, votoRow, field('Descrizione', desc),
      mk('div', 'mappa-fotolbl', 'Foto'), foto.el, save, del);
  });
}

// ---- AGGIUNTA LUOGO ----
function openForm(latlng, prefill = {}) {
  openSheet('Nuovo luogo', sheet => {
    const nome = mk('input'); nome.placeholder = 'Nome del posto'; if (prefill.nome) nome.value = prefill.nome;
    const citta = mk('input'); citta.placeholder = 'Città (facoltativa)'; if (prefill.citta) citta.value = prefill.citta;
    const data = mk('input'); data.type = 'date'; data.value = todayISO();
    const intimo = mk('input'); intimo.type = 'checkbox';
    const intimoRow = mk('label', 'mappa-check'); add(intimoRow, intimo, mk('span', null, " L'abbiamo fatto qui 🔥"));
    const voto = votoSelector(0);
    const votoRow = mk('div', 'mappa-field'); add(votoRow, mk('label', null, 'Quanto è stato bello'), voto.el);
    votoRow.style.display = 'none';
    intimo.onchange = () => { votoRow.style.display = intimo.checked ? '' : 'none'; };
    const desc = mk('textarea'); desc.placeholder = 'Descrizione…';
    const foto = fotoEditor(ctx, { contesto: 'luogo', refId: null });
    const coordLbl = mk('div', 'mappa-coord', `📍 ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);

    const save = mk('button', 'btn', 'Salva il luogo');
    save.onclick = async () => {
      if (!nome.value.trim()) { toast('Serve un nome', 'err'); return; }
      try {
        const row = await addLuogo(ctx.client, {
          couple_id: ctx.me.couple_id, autore_id: ctx.me.id,
          nome: nome.value.trim(), citta: citta.value.trim(),
          lat: latlng.lat, lng: latlng.lng,
          intimo: intimo.checked, voto: voto.get(),
          descrizione: desc.value.trim(), data_evento: data.value,
        });
        await foto.flush(row.id);
        sheet.closest('.modal').remove();
        toast('Luogo aggiunto');
        await renderMappa(ctx);
      } catch (err) { toast('Errore: ' + err.message, 'err'); }
    };

    add(sheet, coordLbl, field('Nome', nome), field('Città', citta), field('Quando', data),
      intimoRow, votoRow, field('Descrizione', desc),
      mk('div', 'mappa-fotolbl', 'Foto'), foto.el, save);
  });
}

// Cerca un indirizzo via Nominatim (OSM, gratuito) oppure scegli toccando la mappa.
function startAdd() {
  if (!map) { toast('Apri prima la mappa'); return; }
  openSheet('Aggiungi un luogo', sheet => {
    const q = mk('input'); q.placeholder = 'Cerca un indirizzo o una città…';
    const cerca = mk('button', 'btn', 'Cerca');
    const results = mk('div', 'mappa-results');
    cerca.onclick = async () => {
      const term = q.value.trim(); if (!term) return;
      clear(results); add(results, mk('div', 'mst-empty', 'Cerco…'));
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(term),
          { headers: { 'Accept-Language': 'it' } });
        const list = await r.json();
        clear(results);
        if (!list.length) { add(results, mk('div', 'mst-empty', 'Nessun risultato.')); return; }
        for (const it of list) {
          const row = mk('button', 'mappa-result', it.display_name);
          row.onclick = () => {
            sheet.closest('.modal').remove();
            const latlng = { lat: parseFloat(it.lat), lng: parseFloat(it.lon) };
            map.setView([latlng.lat, latlng.lng], 14);
            openForm(latlng, { citta: (it.display_name.split(',')[0] || '').trim() });
          };
          add(results, row);
        }
      } catch (err) { clear(results); toast('Ricerca fallita: ' + err.message, 'err'); }
    };
    const orTap = mk('button', 'mappa-tbtn', '📍 …o tocca un punto sulla mappa');
    orTap.onclick = () => {
      sheet.closest('.modal').remove();
      toast('Tocca la mappa nel punto giusto');
      map.once('click', e => openForm(e.latlng));
    };
    add(sheet, field('Indirizzo', q), cerca, results, mk('div', 'mappa-or', 'oppure'), orTap);
  });
}

// Il FAB globale delega al tab corrente via evento 'fab:<tab>'.
document.addEventListener('fab:mappa', startAdd);
