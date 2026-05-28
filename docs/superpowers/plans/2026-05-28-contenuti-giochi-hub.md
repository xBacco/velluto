# Contenuti dei giochi — Hub in Impostazioni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la voce "Contenuti dei giochi" in Impostazioni con una sotto-schermata a 3 tab (underline minimal) che permette di modificare i contenuti di Slot, Ruota e Yahtzutra restando dentro al foglio Impostazioni.

**Architecture:** Si estraggono i 3 editor di gioco da `openSheet`-wrapper a funzioni `render<X>EditorInto(host, ctx, onSaved)` riusabili. L'hub nuovo (`openContenutiGiochi()` in `impostazioni.js`) usa il pattern push-to-side già esistente di `openSvuota`, mostra 3 tab e monta l'editor del tab attivo nel container. I FAB ＋ in pagina Giochi diventano wrapper sottili che riusano la stessa funzione.

**Tech Stack:** Vanilla JS modules, DOM API, helper `mk`/`add`/`clear` da `js/ui.js`, store Supabase per Slot/Ruota, localStorage per Yahtzutra. Niente test automatici per la UI (la base esistente testa logica, non DOM): la verifica è manuale tramite PWA in produzione dopo push.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-28-contenuti-giochi-hub-design.md`.

**Mockup di riferimento:** `mockups/impostazioni-contenuti-giochi-tab.html` (variante centrale, "Underline minimal").

**Convenzione commit + push:** Dopo OGNI task fai `git add <files>; git commit -m "..."; git push origin master`. La PWA mobile carica solo da GitHub, quindi senza push non si testa.

---

## File Structure

| File | Responsabilità nel piano |
|---|---|
| `styles.css` | Nuove classi: `.cg-head`, `.cg-tabs-wrap`, `.cg-tabs`, `.cg-tab`, `.cg-tab.on`, `.cg-indicator`, `.cg-pane`, `.yz-row`, `.yz-head`, `.yz-nm`, `.yz-val`, `.yz-az`, `.yz-sep`. |
| `js/modules/giochi.js` | Estrai `renderSlotEditorInto`, refattorizza `openEditor` per usarla. Rimuovi listener `giochi:contenuti` + flag `pendingContenuti`. |
| `js/modules/ruota.js` | Estrai `renderRuotaEditorInto`, refattorizza `openEditorRuota` per usarla. |
| `js/modules/yahtzutra.js` | Estrai `renderYahtzutraEditorInto` (solo editor caselle), refattorizza `openImpostazioni` cog per usarla + appendere la danger-zone. |
| `js/modules/impostazioni.js` | Importa le 3 `render*EditorInto`. Aggiungi `openContenutiGiochi()`. Cambia onclick della riga "Contenuti dei giochi" in `renderPersonalizza`. |
| `sw.js` | Bump cache `lussuria-v7` → `lussuria-v8` per forzare reload PWA. |

---

## Task 1: CSS — stili tab underline minimal + yz-row

**Files:**
- Modify: `styles.css` (append in fondo)

- [ ] **Step 1: Aggiungi le classi CSS**

Append in fondo a `styles.css`:

```css
/* ===== Impostazioni → Contenuti dei giochi (hub a tab) ===== */
.cg-tabs-wrap{
  position:relative;
  border-bottom:1px solid rgba(212,168,108,.18);
  margin:8px 0 14px;
}
.cg-tabs{display:flex;justify-content:space-around;}
.cg-tab{
  flex:1;
  font-family:Arial,Helvetica,sans-serif;
  font-size:12px;letter-spacing:.4px;
  color:#a87e6a;
  padding:10px 4px 11px;
  background:transparent;border:0;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;gap:5px;
  transition:color .25s ease;
}
.cg-tab .em{font-size:18px;line-height:1;}
.cg-tab .nm{font-size:11.5px;}
.cg-tab.on{color:#e9c98f;}
.cg-tab:not(.on):active{color:#f3d9b0;}
.cg-indicator{
  position:absolute;bottom:-1px;left:0;
  height:2px;width:33.333%;
  background:linear-gradient(90deg,transparent,#d4a86c,transparent);
  border-radius:2px;
  box-shadow:0 0 10px rgba(212,168,108,.6);
  transition:left .35s cubic-bezier(.17,.67,.18,1);
}
.cg-pane{min-height:120px;}

/* ===== Editor Yahtzutra (riga per casella) ===== */
.yz-row{
  background:rgba(8,2,5,.32);
  border:1px solid rgba(212,168,108,.14);
  border-radius:12px;
  padding:9px 11px 10px;
  margin-bottom:7px;
}
.yz-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px;}
.yz-nm{font-size:13.5px;color:#e9c98f;}
.yz-val{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#9d8478;}
.yz-az{
  width:100%;
  font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#f3d9b0;
  background:rgba(8,2,5,.5);
  border:1px solid rgba(212,168,108,.22);
  border-radius:8px;
  padding:6px 9px;
}
.yz-az:focus{outline:none;border-color:#d4a86c;}
.yz-sep{
  font-family:Arial,Helvetica,sans-serif;
  font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;
  color:#d4a86c;margin:14px 4px 8px;opacity:.85;
}
```

- [ ] **Step 2: Commit + push**

```bash
git add styles.css
git commit -m "feat(impostazioni): css per hub Contenuti giochi (tab underline + yz-row)"
git push origin master
```

---

## Task 2: Estrai `renderSlotEditorInto` in `giochi.js`

**Files:**
- Modify: `js/modules/giochi.js:234-265`

- [ ] **Step 1: Aggiungi la funzione esportata sopra `openEditor()` (riga 234)**

Inserisci PRIMA della riga `function openEditor() {` (riga 234):

```js
// Monta l'editor dei contenuti Slot dentro a `host` (qualsiasi container DOM).
// Usato sia dal FAB + in pagina Giochi (via openEditor) sia dall'hub
// "Contenuti dei giochi" in Impostazioni.
// onSaved: callback opzionale chiamato dopo save riuscito.
export async function renderSlotEditorInto(host, context, onSaved) {
  // garantisce facce caricate
  if (!facce || !ctx || ctx.client !== context.client) {
    ctx = context;
    let rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    if (!rows.length) {
      await seedDadiFacce(ctx.client, facceDefaultRows(ctx.me.couple_id));
      rows = await listDadiFacce(ctx.client, ctx.me.couple_id);
    }
    facce = raggruppaFacce(rows);
  }

  clear(host);
  add(host, mk('p', 'muted', 'Cambia emoji e testo di ogni faccia. Tre dadi: Azione, Corpo, Dove.'));
  const dirty = new Map();   // id -> { emoji, testo }
  for (const k of DADI_ORDER) {
    host.appendChild(mk('div', 'section-label', DADI_LABEL[k]));
    facce[k].forEach(f => {
      const row = mk('div', 'dadi-edit-row');
      const em = mk('input', 'dadi-em'); em.value = f.emoji; em.maxLength = 4;
      const tx = mk('input'); tx.value = f.testo; tx.placeholder = 'testo';
      const mark = () => dirty.set(f.id, { emoji: em.value.trim() || '✦', testo: tx.value.trim() });
      em.oninput = mark; tx.oninput = mark;
      add(row, em, tx);
      host.appendChild(row);
    });
  }
  const save = mk('button', 'btn', 'Salva'); save.style.cssText = 'width:100%;margin-top:8px;';
  save.onclick = async () => {
    save.disabled = true;
    try {
      for (const [id, patch] of dirty) {
        if (!patch.testo) { toast('Il testo non può essere vuoto', 'err'); save.disabled = false; return; }
        await updateDadiFaccia(ctx.client, id, patch);
      }
      toast('Slot salvato', 'ok');
      onSaved && onSaved();
    } catch (err) { save.disabled = false; toast('Errore salvataggio: ' + err.message, 'err'); }
  };
  host.appendChild(save);
}
```

- [ ] **Step 2: Refattorizza `openEditor()` (riga 234) per usare la nuova funzione**

Sostituisci la funzione `openEditor()` corrente (righe 234-265) con:

```js
// Wrapper FAB + in pagina Giochi: apre il sheet e monta l'editor inline.
function openEditor() {
  openSheet('Modifica i dadi', async s => {
    await renderSlotEditorInto(s, ctx, async () => {
      const modal = s.closest('.modal');
      if (modal) modal.remove();
      document.body.classList.remove('locked');
      await renderGiochi(ctx);
    });
  });
}
```

- [ ] **Step 3: Verifica manuale (NON ancora committare)**

Apri la PWA → tab Giochi → Slot → FAB ＋ → si apre il sheet "Modifica i dadi" come prima. Modifica una faccia → Salva → toast OK, sheet si chiude, slot refreshato. Comportamento identico a prima.

> Se non riesci a testare da PWA mobile in questo momento, salta direttamente al commit: il test manuale finisce alla Task 9.

- [ ] **Step 4: Commit + push**

```bash
git add js/modules/giochi.js
git commit -m "refactor(giochi): estrai renderSlotEditorInto per riuso da Impostazioni"
git push origin master
```

---

## Task 3: Estrai `renderRuotaEditorInto` in `ruota.js`

**Files:**
- Modify: `js/modules/ruota.js:229-288`

- [ ] **Step 1: Aggiungi la funzione esportata sopra `openEditorRuota()` (riga 229)**

Inserisci PRIMA della riga `export function openEditorRuota() {` (riga 229):

```js
// Monta l'editor dei contenuti Ruota dentro a `host`.
// Usato sia dal FAB + in pagina Giochi (via openEditorRuota) sia dall'hub
// "Contenuti dei giochi" in Impostazioni.
// onSaved: callback opzionale chiamato dopo save riuscito.
export async function renderRuotaEditorInto(host, context, onSaved) {
  // garantisce ctx e state.cont aggiornati
  if (!ctx || ctx.client !== context.client) ctx = context;
  state.cont = await listRuotaContenuti(ctx.client, ctx.me.couple_id);

  clear(host);
  add(host, mk('p', 'muted', 'Proposte piccanti (🔥) e buoni a sorpresa (🎁). Modificabili in qualsiasi momento.'));
  sezioneEditor(host, 'piccante', '🔥 Proposte piccanti');
  sezioneEditor(host, 'buono', '🎁 Buoni a sorpresa');

  // l'editor Ruota salva ogni campo on-blur (vedi rigaEditor), non serve
  // bottone Salva. Notifica subito il caller "pronto".
  if (onSaved) host._onSaved = onSaved;  // usato da refreshEditor dopo add
}
```

- [ ] **Step 2: Refattorizza `openEditorRuota()` (riga 229)**

Sostituisci:

```js
export function openEditorRuota() {
  openSheet('Modifica i contenuti della Ruota', s => {
    add(s, mk('p', 'muted', 'Proposte piccanti (🔥) e buoni a sorpresa (🎁). Modificabili in qualsiasi momento.'));
    sezioneEditor(s, 'piccante', '🔥 Proposte piccanti');
    sezioneEditor(s, 'buono', '🎁 Buoni a sorpresa');
  });
}
```

con:

```js
export function openEditorRuota() {
  openSheet('Modifica i contenuti della Ruota', async s => {
    await renderRuotaEditorInto(s, ctx);
  });
}
```

- [ ] **Step 3: Aggiorna `refreshEditor()` (riga 284) per supportare entrambi i contesti**

Sostituisci:

```js
async function refreshEditor(sheet) {
  state.cont = await listRuotaContenuti(ctx.client, ctx.me.couple_id);
  const modal = sheet.closest('.modal'); if (modal) modal.remove();
  openEditorRuota();
}
```

con:

```js
async function refreshEditor(host) {
  // Se siamo dentro un modal (FAB +), chiudilo e riapri il sheet.
  // Se siamo inline (hub Impostazioni), re-renderizza nello stesso host.
  const modal = host.closest && host.closest('.modal');
  if (modal) {
    modal.remove();
    openEditorRuota();
  } else {
    await renderRuotaEditorInto(host, ctx);
  }
}
```

- [ ] **Step 4: Commit + push**

```bash
git add js/modules/ruota.js
git commit -m "refactor(ruota): estrai renderRuotaEditorInto per riuso da Impostazioni"
git push origin master
```

---

## Task 4: Estrai `renderYahtzutraEditorInto` in `yahtzutra.js`

**Files:**
- Modify: `js/modules/yahtzutra.js:718-781`

- [ ] **Step 1: Aggiungi la funzione esportata sopra `openImpostazioni()` (riga 718)**

Inserisci PRIMA della riga `function openImpostazioni() {` (riga 718):

```js
// Monta l'editor delle azioni Yahtzutra dentro a `host`.
// Usato sia dal cog ⚙ dentro al gioco (via openImpostazioni) sia dall'hub
// "Contenuti dei giochi" in Impostazioni.
// onSaved: callback opzionale chiamato dopo save riuscito.
// NOTA: il blocco "Abbandona partita" NON è qui — vive solo nel wrapper cog.
export function renderYahtzutraEditorInto(host, context, onSaved) {
  if (!ctx || ctx.client !== context.client) {
    ctx = context;
    loadAzioni();
  }

  clear(host);
  host.appendChild(mk('p', 'muted', 'Personalizza l\'azione abbinata a ogni casella. Le modifiche valgono per la prossima partita.'));
  host.appendChild(mk('div', 'yz-sep', '— Numeri —'));

  const dirty = {};
  for (const item of CASELLE) {
    if (item === '--') {
      host.appendChild(mk('div', 'yz-sep', '— Combinazioni —'));
      continue;
    }
    const row = mk('div', 'yz-row');
    const head = mk('div', 'yz-head');
    head.appendChild(mk('div', 'yz-nm', item.nome));
    head.appendChild(mk('div', 'yz-val', item.val));
    row.appendChild(head);
    const az = mk('input', 'yz-az');
    az.value = azioni[item.key] || '';
    az.placeholder = 'Azione abbinata...';
    az.oninput = () => { dirty[item.key] = az.value.trim(); };
    row.appendChild(az);
    host.appendChild(row);
  }

  const btns = mk('div', 'yz-set-btns');
  const reset = mk('button', 'btn ghost sm', 'Ripristina default');
  const save = mk('button', 'btn gold sm', 'Salva');
  reset.onclick = () => {
    azioni = { ...DEFAULT_AZ };
    saveAzioni();
    renderYahtzutraEditorInto(host, ctx, onSaved);
    toast('Ripristinate le azioni di default', 'info');
  };
  save.onclick = () => {
    Object.assign(azioni, dirty);
    saveAzioni();
    toast('Yahtzutra salvato', 'ok');
    onSaved && onSaved();
  };
  add(btns, reset, save);
  host.appendChild(btns);
}
```

- [ ] **Step 2: Refattorizza `openImpostazioni()` (riga 718)**

Sostituisci la funzione `openImpostazioni()` corrente (righe 718-781) con:

```js
function openImpostazioni() {
  openSheet('⚙ Impostazioni Yahtzutra', s => {
    renderYahtzutraEditorInto(s, ctx, () => {
      // Dentro al gioco: chiudi il sheet dopo save e re-renderizza la scheda
      // (così se le azioni cambiano si vedono subito sui prossimi tap).
      s.closest('.modal').remove();
      renderScheda();
    });

    // Danger zone: appare solo se c'è una partita attiva.
    // Vive nel wrapper del cog, NON nell'editor riusabile.
    if (hasActiveGame()) {
      const danger = mk('div', 'yz-set-danger');
      danger.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px dashed rgba(212,168,108,.2);';
      const abandon = mk('button', 'btn ghost sm yz-danger', '⚑ Abbandona partita');
      abandon.style.cssText = 'width:100%;';
      let armed = false;
      abandon.onclick = () => {
        if (!armed) {
          armed = true;
          abandon.textContent = 'Sicuro? Tocca di nuovo per confermare';
          setTimeout(() => { armed = false; abandon.textContent = '⚑ Abbandona partita'; }, 3500);
          return;
        }
        s.closest('.modal').remove();
        if (tableScrim) { tableScrim.remove(); tableScrim = null; }
        resetGame();
        closeGameModal();
        toast('Partita abbandonata', 'info');
      };
      danger.appendChild(abandon);
      s.appendChild(danger);
    }
  });
}
```

- [ ] **Step 3: Commit + push**

```bash
git add js/modules/yahtzutra.js
git commit -m "refactor(yahtzutra): estrai renderYahtzutraEditorInto per riuso da Impostazioni"
git push origin master
```

---

## Task 5: Hub `openContenutiGiochi()` in `impostazioni.js`

**Files:**
- Modify: `js/modules/impostazioni.js` (header import + nuova funzione)

- [ ] **Step 1: Aggiungi gli import in cima al file**

Modifica le righe 1-7 di `js/modules/impostazioni.js`. Sostituisci:

```js
import { mk, add, clear, toast } from '../ui.js';
import { updateProfile, listTipi, addTipo, updateTipo, deleteTipo, seedTipi,
         wipeDesideri, wipeEsperienze, wipeBuoni, wipeGiochi, wipeLuoghi, wipeTipi } from '../store.js';
import { logout } from '../auth.js';
import { isLockEnabled, setPin, disableLock, isPinValid, getPudica, setPudica,
         bioSupported, isBioEnabled, enableBio, disableBio } from '../lib/lock.js';
import { tipiDefaultRows } from '../lib/logic.js';
```

con:

```js
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
```

- [ ] **Step 2: Aggiungi `openContenutiGiochi()` in fondo al file**

Append in fondo a `js/modules/impostazioni.js` (dopo `showInstall()`):

```js
// ===== Contenuti dei giochi: hub a tab dentro Impostazioni =====
// Pattern push-to-side analogo a openSvuota: sostituisce il contenuto di
// setBody con header + tab strip + container editor. Non chiude il foglio.
const CG_TABS = [
  { key: 'slot', em: '🎰', nm: 'Slot',      render: renderSlotEditorInto },
  { key: 'ruota', em: '🎡', nm: 'Ruota',    render: renderRuotaEditorInto },
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
```

- [ ] **Step 3: Commit + push**

```bash
git add js/modules/impostazioni.js
git commit -m "feat(impostazioni): hub Contenuti giochi con tab underline (slot/ruota/yz)"
git push origin master
```

---

## Task 6: Collega la riga "Contenuti dei giochi" all'hub

**Files:**
- Modify: `js/modules/impostazioni.js:205-214`

- [ ] **Step 1: Cambia l'onclick della riga**

In `renderPersonalizza()`, sostituisci (righe 205-213):

```js
  // CONTENUTI GIOCHI
  const rG = row('🎲', 'Contenuti dei giochi', 'Proposte piccanti · buoni a sorpresa');
  rG.classList.add('tap');
  add(rG, mk('span', 'set-chev', '›'));
  rG.onclick = () => {
    closeImpostazioni();
    document.dispatchEvent(new CustomEvent('goto', { detail: 'giochi' }));
    document.dispatchEvent(new CustomEvent('giochi:contenuti'));
  };
  add(c, rG);
```

con:

```js
  // CONTENUTI GIOCHI → hub a tab dentro Impostazioni (non chiude il foglio)
  const rG = row('🎲', 'Contenuti dei giochi', 'Modifica Slot · Ruota · Yahtzutra');
  rG.classList.add('tap');
  add(rG, mk('span', 'set-chev', '›'));
  rG.onclick = openContenutiGiochi;
  add(c, rG);
```

- [ ] **Step 2: Commit + push**

```bash
git add js/modules/impostazioni.js
git commit -m "feat(impostazioni): voce 'Contenuti dei giochi' apre l'hub a tab inline"
git push origin master
```

---

## Task 7: Rimuovi il listener `giochi:contenuti` da `giochi.js`

**Files:**
- Modify: `js/modules/giochi.js:17`, `js/modules/giochi.js:20-27`, `js/modules/giochi.js:43`

- [ ] **Step 1: Rimuovi la flag `pendingContenuti`**

Elimina la riga 17 di `js/modules/giochi.js`:

```js
let pendingContenuti = false;   // editor Ruota da aprire dopo il prossimo renderGiochi
```

- [ ] **Step 2: Rimuovi il listener globale**

Elimina le righe 20-27 di `js/modules/giochi.js`:

```js
// Listener globale: l'opzione "Contenuti giochi" nelle Impostazioni emette `giochi:contenuti`
// dopo `goto giochi`. Se la tab Giochi non è ancora stata renderizzata, segnamo pendingContenuti
// e lo consumiamo alla fine del prossimo renderGiochi.
document.addEventListener('giochi:contenuti', async () => {
  giocoCorrente = 'ruota';
  if (ctx) { await renderGiochi(ctx); openEditorRuota(); }
  else pendingContenuti = true;
});
```

- [ ] **Step 3: Rimuovi il consumo di `pendingContenuti` da `renderGiochi`**

In `renderGiochi()` (righe 32-44), elimina la riga 43:

```js
  if (pendingContenuti) { pendingContenuti = false; openEditorRuota(); }
```

- [ ] **Step 4: Verifica grep**

Run: `grep -n "pendingContenuti\|giochi:contenuti" js/modules/giochi.js js/modules/impostazioni.js`
Expected: nessun output (il path vecchio è completamente rimosso).

- [ ] **Step 5: Commit + push**

```bash
git add js/modules/giochi.js
git commit -m "chore(giochi): rimuovi listener giochi:contenuti, ora l'hub vive in Impostazioni"
git push origin master
```

---

## Task 8: Bump cache service worker

**Files:**
- Modify: `sw.js:1`

- [ ] **Step 1: Bump versione cache**

In `sw.js`, riga 1, cambia:

```js
const CACHE = 'lussuria-v7';
```

in:

```js
const CACHE = 'lussuria-v8';
```

- [ ] **Step 2: Commit + push**

```bash
git add sw.js
git commit -m "chore(sw): bump cache lussuria-v7 → v8 per forzare reload PWA"
git push origin master
```

---

## Task 9: Test manuale + bugfix se necessari

Dopo l'ultimo push, attendi che la PWA mobile aggiorni (chiudi e riapri l'app, o force-reload se da browser).

- [ ] **Step 1: Apertura hub**

Apri Impostazioni → Personalizza → tap "🎲 Contenuti dei giochi". Atteso:
- Il foglio Impostazioni NON si chiude.
- `setBody` ora mostra: back-button "‹ Indietro", titolo "Contenuti giochi", 3 tab (🎰 Slot · 🎡 Ruota · 🎲 Yahtzutra) con sottolineatura oro sotto a Slot, editor Slot caricato.

- [ ] **Step 2: Switch tab**

Tap su "🎡 Ruota". Atteso: indicatore oro scorre a destra di 33.3%, il pane si svuota e mostra l'editor Ruota (proposte piccanti + buoni a sorpresa, con + Aggiungi). Tap su "🎲 Yahtzutra": indicatore al 66.6%, editor con 13 caselle (Numeri / Combinazioni), Salva e Ripristina default.

- [ ] **Step 3: Save Slot**

Tab Slot → cambia testo di una faccia (es. "Azione" prima riga). Tap "Salva". Atteso: toast "Slot salvato". Switch tab e torna a Slot: la modifica è persistente.

- [ ] **Step 4: Save Yahtzutra**

Tab Yahtzutra → cambia azione di "Tris". Tap "Salva". Atteso: toast "Yahtzutra salvato". Riapri l'hub: persiste (è in localStorage).

- [ ] **Step 5: Ripristina default Yahtzutra**

Tap "Ripristina default". Atteso: toast info + tutte le azioni tornano ai valori `DEFAULT_AZ`.

- [ ] **Step 6: Save Ruota**

Tab Ruota → modifica testo di una proposta → tab via e torna a Ruota: persiste (save on-blur, non c'è bottone Salva).

- [ ] **Step 7: Back**

Tap "‹ Indietro". Atteso: torno alla schermata principale Impostazioni con Profilo/Privacy/Personalizza/Dati/Account. Foglio NON chiuso.

- [ ] **Step 8: Niente regressione FAB**

Chiudi Impostazioni. Vai a tab Giochi → tab "Slot" → tap "＋" (in alto o dock). Atteso: si apre il sheet "Modifica i dadi" identico a prima, Salva → toast, sheet chiuso, slot refreshato. Idem per "🎡 Ruota" col tap ＋. Idem per "🎲 Yahtzutra" entrando in partita e tappando il cog ⚙.

- [ ] **Step 9: Niente regressione `giochi:contenuti`**

Run: `grep -rn "giochi:contenuti\|pendingContenuti" js/`
Expected: nessun output.

- [ ] **Step 10: Se trovi un bug**

Fixalo, rifai test, commit+push. Esempio messaggio:

```bash
git commit -m "fix(impostazioni): <descrizione del bug trovato in test>"
git push origin master
```

- [ ] **Step 11: Chiusura task**

Se tutti gli step da 1 a 9 sono verdi, il piano è completo. Comunica a Tomas che l'hub è in produzione e va.

---

## Note finali

- **Persistenza Yahtzutra invariata:** resta `localStorage` `yz-azioni-{couple_id}`. La sincronizzazione con l'altro partner non avviene (è un limite noto, fuori scope qui).
- **Editor Ruota: save on-blur:** l'editor Ruota non ha un bottone Salva — ogni `<input>` salva su `onchange`. È il comportamento attuale, l'hub lo eredita as-is.
- **Eventuali errori di import circolare:** `impostazioni.js` importa da `giochi.js`, `ruota.js`, `yahtzutra.js`. Nessuno di questi importa da `impostazioni.js`, quindi non ci sono cicli. Se per qualche ragione esistono già import da impostazioni nei moduli giochi (controlla con `grep`), risolvi spostando le funzioni esportate in un file `js/modules/editors.js` separato e importando da lì in tutti e due i contesti.
