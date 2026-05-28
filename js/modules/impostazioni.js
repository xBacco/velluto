import { mk, add, clear, toast } from '../ui.js';
import { updateProfile, listTipi, addTipo, updateTipo, deleteTipo, seedTipi,
         wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../store.js';
import { logout } from '../auth.js';
import { isLockEnabled, setPin, disableLock, isPinValid, getPudica, setPudica,
         bioSupported, isBioEnabled, enableBio, disableBio } from '../lib/lock.js';
import { tipiDefaultRows } from '../lib/logic.js';
import { renderSlotEditorInto } from './giochi.js';
import { renderRuotaEditorInto } from './ruota.js';
import { renderYahtzutraEditorInto } from './yahtzutra.js';

const EMOJI = ['🐻','🧁','🦊','🦋','🐰','🐱','🐺','🦌','🌹','🍑','🔥','💋','🍒','🌙','⭐','🥃','🍫','🐝','🦢','🕯️','🍓','💎'];

let CTX = null;            // { client, me, onProfileChange }

export function openImpostazioni(ctx) {
  if (ctx) CTX = ctx;
  ensureDom();
  document.getElementById('setScrim').classList.add('show');
  document.getElementById('setSheet').classList.add('show');
  document.body.classList.add('locked');
  renderMain();
}
function closeImpostazioni() {
  document.getElementById('setScrim').classList.remove('show');
  document.getElementById('setSheet').classList.remove('show');
  document.body.classList.remove('locked');
}

function ensureDom() {
  if (document.getElementById('setSheet')) return;
  const scrim = mk('div', 'set-scrim'); scrim.id = 'setScrim'; scrim.onclick = closeImpostazioni;
  const sheet = mk('div', 'set-sheet'); sheet.id = 'setSheet';
  const body = mk('div', 'set-body'); body.id = 'setBody';
  const head = mk('div', 'set-head');
  add(head, mk('h2', null, 'Impostazioni'));
  const x = mk('button', 'set-x', '✕'); x.onclick = closeImpostazioni;
  add(head, x);
  add(sheet, head, body);
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
}

function sec(title) { const s = mk('div', 'set-sec'); add(s, mk('div', 'set-sec-t', title)); return s; }
function card() { return mk('div', 'set-card'); }
function row(emoji, name, sub) {
  const r = mk('div', 'set-row');
  const l = mk('div', 'set-l'); add(l, mk('span', 'set-em', emoji));
  const t = mk('div'); add(t, mk('div', 'set-nm', name)); if (sub) add(t, mk('div', 'set-sub', sub));
  add(l, t); add(r, l);
  return r;
}
function sw(on, onToggle) {
  const s = mk('div', on ? 'set-sw on' : 'set-sw'); add(s, mk('div', 'knob'));
  s.onclick = () => { s.classList.toggle('on'); onToggle(s.classList.contains('on')); };
  return s;
}

function renderMain() {
  const body = document.getElementById('setBody'); clear(body);
  const { client, me } = CTX;

  // PROFILO
  const pSec = sec('Profilo'); const pCard = mk('div', 'set-card pad');
  const prof = mk('div', 'set-prof');
  const av = mk('div', 'set-avatar'); const face = mk('span', null, me.avatar || '❤️');
  add(av, face, mk('div', 'set-pen', '✎'));
  const grow = mk('div', 'set-grow');
  const lbl = mk('label', 'set-lbl', 'Il tuo nome');
  const inp = mk('input', 'set-fld'); inp.id = 'setNameInput'; inp.value = me.display_name || '';
  lbl.htmlFor = inp.id;
  add(grow, lbl);
  add(grow, inp); add(prof, av, grow);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(doSave, 600); };
  async function doSave() {
    try {
      await updateProfile(client, me.id, { display_name: inp.value.trim(), avatar: face.textContent });
      me.display_name = inp.value.trim(); me.avatar = face.textContent;
      CTX.onProfileChange && CTX.onProfileChange(me);
      toast('Profilo salvato', 'ok');
    } catch (e) { toast('Errore: ' + e.message, 'err'); }
  }
  inp.oninput = save;
  const picker = mk('div', 'set-picker');
  EMOJI.forEach(e => { const b = mk('button', null, e); b.onclick = () => { face.textContent = e; picker.classList.remove('show'); save(); }; add(picker, b); });
  av.onclick = () => picker.classList.toggle('show');
  add(pCard, prof, picker); add(pSec, pCard); add(body, pSec);

  // PRIVACY & BLOCCO  → Task 10
  add(body, renderPrivacy());
  // PERSONALIZZA      → Task 12
  add(body, renderPersonalizza());
  // DATI              → Task 12
  add(body, renderDati());

  // ACCOUNT
  const aSec = sec('Account'); const aCard = card();
  const pw = row('🔐', 'Cambia password'); add(pw, mk('span', 'set-chev', '›'));
  pw.classList.add('tap'); pw.onclick = openCambiaPassword;   // Task 12 (form)
  add(aCard, pw); add(aSec, aCard);
  const out = mk('button', 'set-logout', 'Esci da Lussuria');
  out.onclick = async () => { closeImpostazioni(); try { await logout(); } catch (_) {} location.reload(); };
  add(aSec, out); add(body, aSec);

  // FOOTER
  const info = mk('div', 'set-appinfo');
  add(info, mk('div', 'set-nm', 'LUSSURIA'), mk('div', null, 'il vostro spazio · v1.0'));
  const inst = mk('div', 'set-inst', '📲 Installa sulla Home'); inst.onclick = showInstall;
  add(info, inst); add(body, info);
}

// placeholder reali (implementati nei task seguenti) per evitare riferimenti rotti
function renderPrivacy() {
  const s = sec('Privacy & blocco'); const c = card();

  // blocco con codice
  const rLock = row('🔒', 'Blocco con codice', "Chiede un PIN all'apertura");
  add(rLock, sw(isLockEnabled(), on => { if (on) openSetPin(); else { disableLock(); disableBio(); renderMain(); } }));
  add(c, rLock);

  // cambia codice (solo se attivo)
  if (isLockEnabled()) {
    const rCh = row('🔑', 'Cambia codice'); rCh.classList.add('tap');
    add(rCh, mk('span', 'set-chev', '›')); rCh.onclick = openSetPin; add(c, rCh);
  }

  // biometrico (solo se supportato)
  if (bioSupported()) {
    const rBio = row('👆', 'Face ID / impronta', 'Sblocco biometrico del dispositivo');
    add(rBio, sw(isBioEnabled(), async on => {
      try { if (on) { if (!isLockEnabled()) { toast('Attiva prima il PIN'); renderMain(); return; } await enableBio(); } else disableBio(); }
      catch (e) { toast('Errore: ' + e.message, 'err'); renderMain(); }
    }));
    add(c, rBio);
  }

  // modalità pudica
  const rPud = row('🙈', 'Modalità pudica', 'Sfoca foto e contenuti spinti');
  add(rPud, sw(getPudica(), on => { setPudica(on); document.body.classList.toggle('pudica', on); }));
  add(c, rPud);

  add(s, c); return s;
}

function openSetPin() {
  const ov = mk('div', 'set-confirm show');
  const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Imposta codice'));
  add(box, mk('p', null, 'Scegli un PIN di 4-6 cifre. Resta su questo dispositivo.'));
  const inp = mk('input', 'set-fld'); inp.type = 'tel'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.placeholder = '••••';
  add(box, inp);
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => { ov.remove(); renderMain(); };
  const go = mk('button', 'set-go', 'Salva'); go.onclick = async () => {
    if (!isPinValid(inp.value)) { toast('PIN non valido (4-6 cifre)'); return; }
    await setPin(inp.value); ov.remove(); renderMain(); toast('Blocco attivo', 'ok');
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
  inp.focus();
}
// ===== Personalizza: Tag del calendario + link Contenuti giochi =====
function renderPersonalizza() {
  const s = sec('Personalizza'); const c = card();

  // TAG (popolati in modo asincrono per non rallentare il render di renderMain)
  const rTag = mk('div', 'set-row col');
  const head = mk('div', 'set-l');
  add(head, mk('span', 'set-em', '🏷️'), mk('span', 'set-nm', 'Tag del calendario'));
  add(rTag, head);
  const chips = mk('div', 'set-chips'); add(rTag, chips);
  add(c, rTag);
  (async () => {
    try {
      const tipi = await listTipi(CTX.client, CTX.me.couple_id);
      clear(chips);
      tipi.forEach(t => {
        const chip = mk('div', 'set-chip2');
        add(chip, document.createTextNode(((t.emoji || '') + ' ' + t.label).trim()));
        const del = mk('span', 'set-del', '×');
        del.onclick = async (ev) => {
          ev.stopPropagation();
          try { await deleteTipo(CTX.client, t.id); chip.remove(); }
          catch (e) { toast('Errore: ' + e.message, 'err'); }
        };
        add(chip, del); add(chips, chip);
      });
      const addc = mk('div', 'set-chip2 add', '+ aggiungi');
      addc.onclick = async () => {
        const label = prompt('Nome del tag (puoi iniziare con un emoji)');
        if (!label) return;
        const m = label.trim().match(/^(\p{Emoji})?\s*(.*)$/u);
        try {
          await addTipo(CTX.client, {
            couple_id: CTX.me.couple_id,
            emoji: (m && m[1]) || '🌶️',
            label: ((m && m[2]) || label.trim()),
            ordine: 99,
          });
          renderMain();
        } catch (e) { toast('Errore: ' + e.message, 'err'); }
      };
      add(chips, addc);
    } catch (e) { toast('Errore tag: ' + e.message, 'err'); }
  })();

  // CONTENUTI GIOCHI → hub a tab dentro Impostazioni (non chiude il foglio)
  const rG = row('🎲', 'Contenuti dei giochi', 'Modifica Slot · Ruota · Yahtzutra');
  rG.classList.add('tap');
  add(rG, mk('span', 'set-chev', '›'));
  rG.onclick = openContenutiGiochi;
  add(c, rG);

  add(s, c); return s;
}

// ===== Dati: Svuota sezioni =====
const WIPES = [
  ['🔥', 'Fantasie', 'desideri',  wipeDesideri],
  ['📅', 'Esperienze',          'esperienze', wipeEsperienze],
  ['🎟️', 'Buoni',                'buoni',     wipeBuoni],
  ['🎲', 'Giochi',               'giochi',    wipeGiochi],
  ['🗺️', 'Luoghi',               'luoghi',    wipeLuoghi],
  ['🏷️', 'Tag',                  'tag',       wipeTipi],
];

function renderDati() {
  const s = sec('Dati'); const c = card();
  const r = row('🗑️', 'Svuota dati', 'Scegli quali sezioni azzerare');
  r.classList.add('tap');
  add(r, mk('span', 'set-chev', '›'));
  r.onclick = openSvuota;
  add(c, r); add(s, c); return s;
}

function openSvuota() {
  const body = document.getElementById('setBody'); clear(body);
  const head = mk('div', 'set-sec');
  const back = mk('button', 'set-back', '‹ Indietro'); back.onclick = renderMain;
  add(head, back); add(body, head);
  add(body, mk('div', 'set-sec-t', 'Seleziona cosa azzerare'));
  const c = card();
  const selected = new Set();

  // Riga "Tutti" in cima: spunta/desuppla in blocco tutte le sezioni sotto.
  const allRow = mk('div', 'set-check set-check-all');
  const allBox = mk('div', 'set-box');
  const allTxt = mk('div'); add(allTxt, mk('div', 'set-nm', '⚡ Tutti'));
  add(allRow, allBox, allTxt);
  add(c, allRow);

  // refs per gestire la sincronizzazione bidirezionale tra "Tutti" e le righe figlie
  const childRefs = [];

  function syncAll() {
    const allOn = childRefs.length > 0 && childRefs.every(r => r.row.classList.contains('on'));
    allRow.classList.toggle('on', allOn);
    allBox.textContent = allOn ? '✓' : '';
  }

  WIPES.forEach(([em, nm, key]) => {
    const ck = mk('div', 'set-check');
    const box = mk('div', 'set-box');
    const t = mk('div'); add(t, mk('div', 'set-nm', em + ' ' + nm));
    add(ck, box, t);
    ck.onclick = () => {
      const on = ck.classList.toggle('on');
      box.textContent = on ? '✓' : '';
      if (on) selected.add(key); else selected.delete(key);
      syncAll();
    };
    add(c, ck);
    childRefs.push({ row: ck, box, key });
  });

  allRow.onclick = () => {
    const turnOn = !allRow.classList.contains('on');
    allRow.classList.toggle('on', turnOn);
    allBox.textContent = turnOn ? '✓' : '';
    for (const { row, box, key } of childRefs) {
      row.classList.toggle('on', turnOn);
      box.textContent = turnOn ? '✓' : '';
      if (turnOn) selected.add(key); else selected.delete(key);
    }
  };

  add(body, c);
  const cta = mk('button', 'set-wipe-cta', 'Svuota le sezioni selezionate');
  cta.onclick = () => confirmWipe(selected);
  add(body, cta);
  add(body, mk('div', 'set-wipe-note', "L'azione è definitiva e vale per tutta la coppia."));
}

function confirmWipe(selected) {
  if (!selected.size) { toast('Seleziona almeno una sezione'); return; }
  const names = WIPES.filter(w => selected.has(w[2])).map(w => w[1]).join(', ');
  const ov = mk('div', 'set-confirm show');
  const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Sei sicuro?'));
  add(box, mk('p', null, 'Stai per svuotare: ' + names + '. Non si può annullare.'));
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => ov.remove();
  const go = mk('button', 'set-go', 'Sì, svuota');
  go.onclick = async () => {
    go.disabled = true;
    try {
      for (const [, , key, fn] of WIPES) {
        if (!selected.has(key)) continue;
        await fn(CTX.client, CTX.me.couple_id);
        if (key === 'tag') await seedTipi(CTX.client, tipiDefaultRows(CTX.me.couple_id));
      }
      ov.remove(); toast('Fatto', 'ok'); closeImpostazioni();
      location.reload();
    } catch (e) { toast('Errore: ' + e.message, 'err'); go.disabled = false; }
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
}

// ===== Account: cambia password =====
function openCambiaPassword() {
  const ov = mk('div', 'set-confirm show');
  const box = mk('div', 'set-cbox');
  add(box, mk('h3', null, 'Cambia password'));
  const p1 = mk('input', 'set-fld'); p1.type = 'password'; p1.placeholder = 'Nuova password';
  const p2 = mk('input', 'set-fld'); p2.type = 'password'; p2.placeholder = 'Conferma'; p2.style.marginTop = '8px';
  add(box, p1, p2);
  const rowB = mk('div', 'set-crow');
  const ann = mk('button', 'set-ann', 'Annulla'); ann.onclick = () => ov.remove();
  const go = mk('button', 'set-go', 'Salva');
  go.onclick = async () => {
    if (p1.value.length < 6) { toast('Almeno 6 caratteri'); return; }
    if (p1.value !== p2.value) { toast('Le password non coincidono'); return; }
    try {
      const { error } = await CTX.client.auth.updateUser({ password: p1.value });
      if (error) throw error;
      ov.remove(); toast('Password aggiornata', 'ok');
    } catch (e) { toast('Errore: ' + e.message, 'err'); }
  };
  add(rowB, ann, go); add(box, rowB); add(ov, box);
  document.getElementById('setSheet').appendChild(ov);
  p1.focus();
}

function showInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(ios ? 'Condividi → "Aggiungi a Home"' : 'Menu del browser → "Installa app"');
}

// ===== Contenuti dei giochi: hub a tab dentro Impostazioni =====
// Pattern push-to-side analogo a openSvuota: sostituisce il contenuto di
// setBody con header + tab strip + container editor. Non chiude il foglio.
const CG_TABS = [
  { key: 'slot',  em: '🎰', nm: 'Slot',      render: renderSlotEditorInto },
  { key: 'ruota', em: '🎡', nm: 'Ruota',     render: renderRuotaEditorInto },
  { key: 'yz',    em: '🎲', nm: 'Yahtzutra', render: renderYahtzutraEditorInto },
];

function openContenutiGiochi() {
  const body = document.getElementById('setBody'); clear(body);

  // Header con back
  const head = mk('div', 'set-sec');
  const back = mk('button', 'set-back', '‹ Indietro'); back.onclick = renderMain;
  add(head, back); add(body, head);
  add(body, mk('div', 'set-sec-t', 'Contenuti giochi'));

  // Tab strip + indicator
  const tabsWrap = mk('div', 'cg-tabs-wrap');
  const tabs = mk('div', 'cg-tabs');
  const tabButtons = [];
  CG_TABS.forEach((t, idx) => {
    const b = mk('button', 'cg-tab' + (idx === 0 ? ' on' : ''));
    add(b, mk('span', 'em', t.em), mk('span', 'nm', t.nm));
    b.onclick = () => activate(idx);
    tabs.appendChild(b);
    tabButtons.push(b);
  });
  const indicator = mk('div', 'cg-indicator');
  add(tabsWrap, tabs, indicator);
  add(body, tabsWrap);

  // Pane per l'editor attivo
  const pane = mk('div', 'cg-pane');
  add(body, pane);

  async function activate(idx) {
    tabButtons.forEach((b, i) => b.classList.toggle('on', i === idx));
    indicator.style.left = (idx * (100 / CG_TABS.length)) + '%';
    pane.scrollTop = 0;
    try {
      await CG_TABS[idx].render(pane, { client: CTX.client, me: CTX.me });
    } catch (e) {
      clear(pane);
      add(pane, mk('p', 'muted', 'Errore caricamento editor: ' + e.message));
    }
  }

  activate(0);   // monta Slot all'apertura
}
