import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  filtraPeriodo, conteggioPerTipo, streakAttuale, giornoRecord,
  relazioniTipi, giornoRecordCombinato, pluralizzaIt,
  mediaSettimanale, perGiornoDelMese, nomeMese,
} from '../lib/logic.js';
import { listEsperienze, listTipi } from '../store.js';

let ctx = null;        // { client, me, panel }
let rows = [];         // esperienze della coppia
let tipi = [];         // tipi di momento della coppia
let statPeriod = 'mese';

export async function renderDati(context) {
  ctx = context;
  try {
    tipi = await listTipi(ctx.client, ctx.me.couple_id);
    rows = await listEsperienze(ctx.client, ctx.me.couple_id);
  } catch (err) { toast('Errore caricamento: ' + err.message, 'err'); rows = []; tipi = []; }
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  const today = todayISO();
  const [y, m] = today.split('-').map(Number);
  const meseLabel = nomeMese(m - 1);

  add(p, mk('h2', 'ptitle', '📊 I nostri numeri'),
         mk('p', 'psub', "Quanto, cosa e quando — a colpo d'occhio."));

  // segmented: questo mese / sempre
  const seg = mk('div', 'seg2');
  for (const [val, lbl] of [['mese', 'Questo mese'], ['sempre', 'Sempre']]) {
    const b = mk('button', statPeriod === val ? 'on' : '', lbl);
    b.onclick = () => { statPeriod = val; draw(); };
    seg.appendChild(b);
  }
  p.appendChild(seg);

  const sel = filtraPeriodo(rows, statPeriod, today);

  // hero: totale del periodo
  const hero = mk('div', 'stat-hero');
  add(hero, mk('div', 'big', String(sel.length)),
            mk('div', 'lbl', statPeriod === 'mese' ? 'momenti a ' + meseLabel : 'momenti in totale'));
  p.appendChild(hero);

  // grid per tipo
  const grid = mk('div', 'stat-grid');
  const perTipoSel = conteggioPerTipo(sel, tipi);
  const perTipoAll = conteggioPerTipo(filtraPeriodo(rows, 'sempre', today), tipi);
  perTipoSel.forEach((o, i) => {
    const nAll = perTipoAll[i].n;
    const c = mk('div', 'stat-card');
    add(c, mk('div', 'se', o.tipo.emoji), mk('div', 'sl', o.tipo.label), mk('div', 'sn', String(o.n)),
        mk('div', 'sm', statPeriod === 'mese' ? nAll + ' in totale' : 'totale'));
    grid.appendChild(c);
  });
  if (perTipoSel.length) p.appendChild(grid);

  // record & medie
  const streak = streakAttuale(rows, today);
  const media = mediaSettimanale(sel, rows, statPeriod, today);

  add(p, mk('div', 'section-label', 'Record & medie'));
  const rl = mk('div', 'rec-list');
  const addRec = (emo, k, v) => {
    const r = mk('div', 'rec');
    add(r, mk('span', 're', emo), mk('span', 'rk', k), mk('span', 'rv', v));
    rl.appendChild(r);
    return r;
  };
  addRec('🔥', 'Streak attuale', streak + (streak === 1 ? ' giorno' : ' giorni') + ' di fila');
  addRec('📈', 'Media', media.toFixed(1) + ' / settimana');
  // riga cliccabile → popup con i record divisi per categoria
  const recRow = addRec('🏆', 'Record per categoria', 'vedi i primati ›');
  recRow.classList.add('rec-link');
  recRow.onclick = openRecordPerCategoria;
  p.appendChild(rl);

  // barre giorno per giorno del mese corrente
  add(p, mk('div', 'section-label', meseLabel + ', giorno per giorno'));
  const perDay = perGiornoDelMese(rows, today);
  const maxV = Math.max(1, ...perDay);
  const wrap = mk('div', 'bars-wrap');
  const bars = mk('div', 'bars');
  perDay.forEach((v, i) => {
    const bar = mk('div', 'bar');
    bar.style.height = (v ? 18 + (v / maxV) * 82 : 2) + '%';
    bar.title = (i + 1) + ': ' + v;
    bars.appendChild(bar);
  });
  wrap.appendChild(bars);
  p.appendChild(wrap);
  p.appendChild(mk('p', 'muted', 'Ogni barra è un giorno di ' + meseLabel + '; più alta = più momenti.'));
}

// Popup: il miglior giorno (di sempre) per ogni categoria. Le sotto-categorie (es. Anale dentro
// Scopata) contano nel record del padre — "di cui N anali" — e hanno anche un loro record a parte.
function openRecordPerCategoria() {
  const { figliDi, figlioIds } = relazioniTipi(tipi);
  openSheet('🏆 Record per categoria', s => {
    add(s, mk('p', 'muted', 'Il massimo che avete fatto in un solo giorno, per ogni categoria.'));
    const list = mk('div'); list.style.marginTop = '12px';
    for (const t of tipi) {
      if (figlioIds.has(t.id)) continue;              // i figli compaiono sotto il padre
      const figli = figliDi[t.id] || [];
      if (figli.length) {
        const rc = giornoRecordCombinato(rows, t.id, figli.map(f => f.id));
        const parti = figli
          .filter(f => rc.perFiglio[f.id])
          .map(f => `${rc.perFiglio[f.id]} ${pluralizzaIt(f.label).toLowerCase()}`);
        list.appendChild(recCatRow(t.emoji, t.label, rc.n, rc.iso, parti.length ? 'di cui ' + parti.join(', ') : null, false));
        for (const f of figli) {
          const rp = giornoRecord(rows.filter(e => e.tipo_id === f.id));
          list.appendChild(recCatRow(f.emoji, t.label + ' ' + f.label.toLowerCase(), rp.n, rp.iso, null, true));
        }
      } else {
        const rp = giornoRecord(rows.filter(e => e.tipo_id === t.id));
        list.appendChild(recCatRow(t.emoji, t.label, rp.n, rp.iso, null, false));
      }
    }
    s.appendChild(list);
  });
}

function recCatRow(emoji, label, n, dateIso, sub, child) {
  const r = mk('div', 'rrow' + (child ? ' child' : ''));
  r.appendChild(mk('span', 're', emoji));
  const body = mk('div', 'rbody');
  body.appendChild(mk('span', 'rk', label));
  if (n) {
    const v = mk('span', 'rv'); add(v, mk('b', null, String(n)), document.createTextNode(' in un giorno'));
    body.appendChild(v);
    if (sub) body.appendChild(mk('span', 'rsub', sub));
    if (dateIso) body.appendChild(mk('span', 'rdate', 'il ' + fmt(dateIso)));
  } else {
    body.appendChild(mk('span', 'rv muted', 'ancora niente'));
  }
  r.appendChild(body);
  return r;
}

function fmt(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
