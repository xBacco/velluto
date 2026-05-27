import { mk, add, clear, toast, openSheet } from '../ui.js';
import {
  fetteRuota, estraiFetta, saldoGiri, puoGirare, giriEleggibile, ultimiPremi,
  ruotaContenutiDefaultRows, proposteDa, buoniSorpresaDa, pescaContenuto,
  segretiDaRivelare,
} from '../lib/logic.js';
import {
  listGiri, accreditaGiro, spendiGiro,
  listRuotaContenuti, seedRuotaContenuti, addRuotaContenuto, updateRuotaContenuto, deleteRuotaContenuto,
  listBuoni, addBuono, listCarte, listDesideri,
} from '../store.js';

let ctx = null;        // { client, me, panel }
let state = null;      // { mov, cont, buoni, carte, proposte, buoniS, desideri, saldo, elegg, fette }
let busy = false;
let rot = 0;           // rotazione cumulativa della ruota (gradi)

const SLICE = 360 / 8;

export async function renderRuota(context) {
  ctx = context;
  const { client, me } = ctx;

  let mov = await listGiri(client, me.couple_id);
  const elegg = giriEleggibile(mov, me.id);
  if (elegg.ok) {
    try {
      await accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'settimanale' });
      mov = await listGiri(client, me.couple_id);
    } catch { /* cosmetico: si riprova alla prossima apertura */ }
  }

  let cont = await listRuotaContenuti(client, me.couple_id);
  if (!cont.length) {
    await seedRuotaContenuti(client, ruotaContenutiDefaultRows(me.couple_id));
    cont = await listRuotaContenuti(client, me.couple_id);
  }

  const buoni = await listBuoni(client, me.couple_id);
  const carte = await listCarte(client, me.couple_id).catch(() => []);
  const desideri = await listDesideri(client, me.couple_id).catch(() => []);
  const proposte = proposteDa(cont), buoniS = buoniSorpresaDa(cont);
  const fette = fetteRuota({
    haSegreti: segretiDaRivelare(buoni, me.id).length > 0,
    haCarte: carte.length > 0,
    haProposte: proposte.length > 0,
    haBuoni: buoniS.length > 0,
  });

  state = {
    mov, cont, buoni, carte, proposte, buoniS, desideri,
    saldo: saldoGiri(mov, me.id), elegg: giriEleggibile(mov, me.id), fette,
  };
  draw();
}

function draw() {
  const p = ctx.panel; clear(p);
  add(p, mk('h2', 'ptitle', '🎡 Ruota a premi'),
    mk('p', 'psub', 'Spendi un giro, vinci un premio. Tocca ＋ per modificare proposte e buoni.'));

  const card = mk('div', 'giri-card');
  const left = mk('div');
  add(left, mk('p', 'k', 'I tuoi giri'));
  const coins = mk('div', 'coins');
  const n = Math.max(state.saldo, 0);
  for (let i = 0; i < Math.max(n, 1); i++) coins.appendChild(mk('span', 'coin ' + (i < n ? 'full' : 'empty')));
  left.appendChild(coins);
  const right = mk('div', 'right');
  right.textContent = state.elegg.ok ? 'gratis disponibile' : 'gratis tra ' + giorniA(state.elegg.prossimoSblocco);
  add(card, left, right);
  p.appendChild(card);

  p.appendChild(buildWheel());

  const btn = mk('button', 'btn ghost-gold ruota-spin', 'GIRA LA RUOTA');
  btn.disabled = !puoGirare(state.saldo);
  const cost = mk('span', 'cost'); cost.appendChild(mk('span', 'c'));
  btn.appendChild(cost);
  btn.onclick = spin;
  p.appendChild(btn);

  const ups = ultimiPremi(state.mov, ctx.me.id);
  if (ups.length) {
    p.appendChild(mk('p', 'section-label', 'Ultimi premi'));
    const list = mk('div', 'ruota-storico');
    for (const u of ups) list.appendChild(mk('div', 'ruota-storico-row',
      (u.fetta ? u.fetta.emoji + ' ' + u.fetta.label : u.esito)));
    p.appendChild(list);
  }
}

function giorniA(iso) {
  const giorni = Math.ceil((new Date(iso) - new Date()) / 864e5);
  return giorni <= 1 ? '1 giorno' : giorni + ' giorni';
}

// ---- ruota (emoji sempre dritte) ----
let wheelEl = null;
let winhiEl = null;

function buildWheel() {
  const wrap = mk('div', 'wheel-wrap');
  wrap.appendChild(mk('div', 'pointer'));
  const wheel = mk('div', 'wheel'); wheel.style.transform = `rotate(${rot}deg)`;
  state.fette.forEach((f, i) => {
    const center = i * SLICE + SLICE / 2;
    const lbl = mk('div', 'slice-lbl');
    const inner = mk('div', 'in');
    inner.style.transform = `rotate(${center}deg) translateY(-104px) rotate(${-center - rot}deg)`;
    const e = mk('span', 'e' + (f.peso === 0 ? ' spenta' : ''), f.emoji);
    inner.appendChild(e); lbl.appendChild(inner); wheel.appendChild(lbl);
  });
  wrap.appendChild(wheel);
  // spotlight sullo spicchio vincente: overlay separato .winhi (vedi styles.css Task 7)
  winhiEl = mk('div', 'winhi');
  wrap.appendChild(winhiEl);
  wrap.appendChild(mk('div', 'hub', '💋'));
  wheelEl = wheel;
  return wrap;
}

async function spin() {
  if (busy || !puoGirare(state.saldo)) return;
  busy = true;
  if (winhiEl) winhiEl.classList.remove('on');

  const pick = estraiFetta(state.fette);
  if (!pick) { busy = false; toast('Nessun premio disponibile', 'err'); return; }
  try {
    await spendiGiro(ctx.client, { couple_id: ctx.me.couple_id, user_id: ctx.me.id, esito: pick.fetta.key });
  } catch (err) { busy = false; toast('Errore: ' + err.message, 'err'); return; }

  const center = pick.indice * SLICE + SLICE / 2;
  rot += 360 * 5 + ((360 - (rot % 360) - center) % 360 + 360) % 360;
  wheelEl.style.transform = `rotate(${rot}deg)`;
  wheelEl.querySelectorAll('.slice-lbl .in').forEach((inner, i) => {
    const c = i * SLICE + SLICE / 2;
    inner.style.transform = `rotate(${c}deg) translateY(-104px) rotate(${-c - rot}deg)`;
  });

  // dopo la rotazione (4.2s): accendi lo spotlight, poi mostra il pop-up
  setTimeout(() => {
    if (winhiEl) winhiEl.classList.add('on');
    setTimeout(() => { showPrize(pick.fetta); busy = false; }, 600);
  }, 4300);
}

// ---- pop-up premio (riusa .dadi-scrim per lo scroll-lock automatico) ----
function showPrize(fetta) {
  const scrim = mk('div', 'ruota-reveal dadi-scrim');
  const stage = mk('div', 'stage'); stage.appendChild(mk('div', 'beam'));
  const card = mk('div', 'prize');
  add(card, mk('p', 'won', 'Hai vinto'), mk('div', 'big', fetta.emoji), mk('p', 'name', fetta.label));
  const body = mk('p', 'body'); card.appendChild(body);
  const row = mk('div', 'row');
  const azione = mk('button', 'btn solid');
  const chiudi = mk('button', 'btn ghost', 'Chiudi');
  const close = () => { scrim.remove(); if (winhiEl) winhiEl.classList.remove('on'); renderRuota(ctx); };
  chiudi.onclick = close;
  add(row, azione, chiudi); card.appendChild(row);
  stage.appendChild(card); scrim.appendChild(stage);
  scrim.onclick = e => { if (e.target === scrim) close(); };
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
  risolvi(fetta, { body, azione, chiudi, scrim });
}

async function risolvi(fetta, ui) {
  const { client, me } = ctx;
  ui.azione.style.display = 'none';
  switch (fetta.key) {
    case 'piccante': {
      const pr = pescaContenuto(state.proposte);
      ui.body.textContent = pr ? pr.testo : '—';
      break;
    }
    case 'buono': {
      const b = pescaContenuto(state.buoniS);
      ui.body.textContent = b ? `${b.testo}: lo trovi nei Buoni.` : 'Un buono a sorpresa!';
      if (b) {
        try {
          const partner = await partnerId();
          await addBuono(client, {
            couple_id: me.couple_id, da_id: partner, a_id: me.id,
            emoji: b.emoji, titolo: b.testo, descrizione: b.descrizione, tipo: 'regalo', stato: 'attivo',
          });
        } catch (err) { toast('Buono non salvato: ' + err.message, 'err'); }
      }
      break;
    }
    case 'desiderio': {
      const dp = (state.desideri || []).filter(d => d.stato === 'da_provare');
      const d = pescaContenuto(dp);
      ui.body.textContent = d ? `Stasera: "${d.testo}".` : 'Aggiungi qualche desiderio da provare!';
      break;
    }
    case 'tod': {
      const c = pescaContenuto(state.carte);
      ui.body.textContent = c ? `${c.tipo === 'verita' ? 'Verità' : 'Sfida'}: ${c.testo}` : 'Aggiungi carte in Obbligo o Verità.';
      break;
    }
    case 'dadi':
      ui.body.textContent = 'Tira i dadi! (vai al gioco Dadi)';
      break;
    case 'ancora':
      ui.body.textContent = 'Giro gratis: ne hai guadagnato un altro!';
      accreditaGiro(client, { couple_id: me.couple_id, user_id: me.id, motivo: 'ancora' })
        .catch(err => toast('Errore: ' + err.message, 'err'));
      break;
    case 'jolly':
      ui.body.textContent = 'Jolly! Scegli tu il premio con il partner.';
      break;
    case 'segreto':
      ui.body.textContent = 'Hai vinto il diritto di aprire un segreto.';
      ui.azione.textContent = 'Scegli quale busta →';
      ui.azione.style.display = '';
      ui.azione.onclick = () => { ui.scrim.remove(); if (winhiEl) winhiEl.classList.remove('on'); apriSceltaSegreto(); };
      break;
  }
}

async function partnerId() {
  const { data, error } = await ctx.client.from('couples')
    .select('membro_a,membro_b').eq('id', ctx.me.couple_id).single();
  if (error) throw new Error(error.message);
  return data.membro_a === ctx.me.id ? data.membro_b : data.membro_a;
}

function apriSceltaSegreto() {
  document.dispatchEvent(new CustomEvent('goto', { detail: 'buoni' }));
}

// ---- editor contenuti (stesso pattern dei Dadi) ----
export function openEditorRuota() {
  openSheet('Modifica i contenuti della Ruota', s => {
    add(s, mk('p', 'muted', 'Proposte piccanti (🔥) e buoni a sorpresa (🎁). Modificabili in qualsiasi momento.'));
    sezioneEditor(s, 'piccante', '🔥 Proposte piccanti');
    sezioneEditor(s, 'buono', '🎁 Buoni a sorpresa');
  });
}

function sezioneEditor(s, categoria, titolo) {
  s.appendChild(mk('div', 'section-label', titolo));
  const items = state.cont.filter(c => c.categoria === categoria).sort((a, b) => a.ordine - b.ordine);
  for (const it of items) s.appendChild(rigaEditor(it, categoria));
  const addBtn = mk('button', 'btn', '＋ Aggiungi');
  addBtn.onclick = async () => {
    try {
      const ordine = items.length;
      await addRuotaContenuto(ctx.client, {
        couple_id: ctx.me.couple_id, categoria,
        emoji: categoria === 'buono' ? '🎁' : null,
        testo: categoria === 'buono' ? 'Nuovo buono' : 'Nuova proposta',
        descrizione: categoria === 'buono' ? '' : null, ordine,
      });
      await refreshEditor(s);
    } catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  s.appendChild(addBtn);
}

function rigaEditor(it, categoria) {
  const row = mk('div', 'ruota-edit-row');
  let emInput = null;
  if (categoria === 'buono') { emInput = mk('input', 'em'); emInput.value = it.emoji || ''; emInput.maxLength = 4; row.appendChild(emInput); }
  const tx = mk('input'); tx.value = it.testo; tx.placeholder = categoria === 'buono' ? 'titolo' : 'proposta';
  row.appendChild(tx);
  let dsInput = null;
  if (categoria === 'buono') { dsInput = mk('input'); dsInput.value = it.descrizione || ''; dsInput.placeholder = 'descrizione'; row.appendChild(dsInput); }
  const save = async () => {
    if (!tx.value.trim()) { toast('Il testo non può essere vuoto', 'err'); return; }
    try {
      await updateRuotaContenuto(ctx.client, it.id, {
        emoji: emInput ? emInput.value.trim() : null,
        testo: tx.value.trim(),
        descrizione: dsInput ? dsInput.value.trim() : null,
      });
    } catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  tx.onchange = save; if (emInput) emInput.onchange = save; if (dsInput) dsInput.onchange = save;
  const del = mk('button', 'icon-del', '🗑'); del.onclick = async () => {
    try { await deleteRuotaContenuto(ctx.client, it.id); row.remove(); state.cont = state.cont.filter(c => c.id !== it.id); }
    catch (err) { toast('Errore: ' + err.message, 'err'); }
  };
  row.appendChild(del);
  return row;
}

async function refreshEditor(sheet) {
  state.cont = await listRuotaContenuti(ctx.client, ctx.me.couple_id);
  const modal = sheet.closest('.modal'); if (modal) modal.remove();
  openEditorRuota();
}
