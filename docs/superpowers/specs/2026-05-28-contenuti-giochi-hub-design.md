# Contenuti dei giochi — Hub in Impostazioni / Design Spec

**Data:** 2026-05-28
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** redesign della voce **Impostazioni → Personalizza → Contenuti dei giochi**
**Si appoggia a:** `2026-05-26-nostro-spazio-fase4-giochi-design.md` (Slot, Ruota, Yahtzutra), pattern `openSvuota()` in `js/modules/impostazioni.js`.
**Cambia:** comportamento della voce "Contenuti dei giochi" (ora hub a tab dentro Impostazioni) e signature degli editor di Slot/Ruota/Yahtzutra (esposti come funzioni `render*EditorInto(host, ctx, onSaved)`).
**Non cambia:** logica di gioco, schema dati Supabase, persistenza Yahtzutra (resta `localStorage`), pulsanti FAB ＋ nella tab Giochi.

---

## 1. Scopo

Oggi la voce **Impostazioni → Personalizza → "🎲 Contenuti dei giochi"** ha tre problemi:

1. **Bugia nel nome.** Promette "i giochi" al plurale ma apre **solo l'editor della Ruota** (`js/modules/impostazioni.js:206-213` → dispatch `giochi:contenuti` → `js/modules/giochi.js:23-27` → `openEditorRuota()`).
2. **Teletrasporto.** Chiude le Impostazioni, salta alla tab Giochi, poi apre l'editor in `openSheet`. Mescola navigazione e azione.
3. **Editor sparpagliati.** Slot si modifica solo dal FAB ＋ in pagina Giochi, Ruota da Impostazioni o FAB, Yahtzutra solo dal cog ⚙ interno alla partita, Strip non si modifica affatto.

Il redesign trasforma la voce in un **hub a tab segmentati sotto-schermata** che resta dentro al foglio Impostazioni, da cui si modificano i tre giochi con contenuti editabili (Slot, Ruota, Yahtzutra). **Strip è escluso** perché il poker non ha contenuti modificabili.

Mockup di riferimento (variante finale = **V2 Underline minimal**):

- `mockups/impostazioni-contenuti-giochi-tab.html` (3 phone affiancati — la 2° colonna è la scelta finale)

---

## 2. Decisioni chiave

| Sezione | Decisione | Sintesi |
|---|---|---|
| Pattern navigazione | **Sub-screen push-to-side** | Stesso pattern di `openSvuota()`. Tap sulla voce → `setBody` viene riempito col nuovo hub. Header con back `‹ Indietro` + titolo "Contenuti giochi". Niente chiusura del foglio Impostazioni. |
| Selettore gioco | **Tab underline minimal** | 3 tab a larghezza uguale (Slot 🎰, Ruota 🎡, Yahtzutra 🎲), solo emoji + nome, sottolineatura oro luminescente che scorre tra i tab con `cubic-bezier(.17,.67,.18,1)`. Nessun background pieno. |
| Tab attivo | **slot** di default | All'apertura dell'hub l'editor Slot è già montato. |
| Switch tab | **Re-render lazy** | Cambio tab → si svuota il container `.cg-pane` e si chiama `render<Gioco>EditorInto(pane, ctx, onSaved)`. Niente cache: il fetch DB di Slot/Ruota viene rifatto, garantendo dati freschi (irrilevante per Yahtzutra che è localStorage). |
| Editor → modulo | **Inline render functions** | Ogni gioco esporta `renderSlotEditorInto / renderRuotaEditorInto / renderYahtzutraEditorInto`. Nessuno apre più un `openSheet`: il body dell'editor viene montato dentro il container passato. |
| FAB ＋ pagina Giochi | **Resta come scorciatoia** | I tap `+` continuano a chiamare `openEditor()` / `openEditorRuota()` / cog Yahtzutra come oggi. Quei wrapper internamente passano per le nuove `render*EditorInto` (così c'è un solo editor per gioco). |
| Strip | **Fuori scope** | Niente tab, niente editor. Se in futuro nascerà contenuto editabile (es. capi di abbigliamento), basterà aggiungere il quarto tab. |

---

## 3. Architettura

### 3.1 File modificati

| File | Cambiamento |
|---|---|
| `js/modules/impostazioni.js` | Voce "Contenuti dei giochi" → `openContenutiGiochi()` (nuova funzione, sostituisce dispatch `goto`+`giochi:contenuti`). Importa le tre funzioni di rendering editor. |
| `js/modules/giochi.js` | Rimuove listener `giochi:contenuti` + flag `pendingContenuti`. `openEditor()` (Slot) viene refattorizzato per usare `renderSlotEditorInto`. Esporta `renderSlotEditorInto`. |
| `js/modules/ruota.js` | `openEditorRuota()` refattorizzato per usare `renderRuotaEditorInto`. Esporta `renderRuotaEditorInto`. |
| `js/modules/yahtzutra.js` | `openImpostazioni()` (cog) refattorizzato per usare `renderYahtzutraEditorInto`. Esporta `renderYahtzutraEditorInto`. **Non** tocca i blocchi danger ("Abbandona partita") che restano nel sheet del cog, non nell'hub. |
| `styles.css` | Aggiunge classi `.cg-tabs`, `.cg-tab`, `.cg-tab.on`, `.cg-indicator`, `.cg-pane`, `.yz-row`, `.yz-head`, `.yz-nm`, `.yz-val`, `.yz-az`, `.yz-sep`. Ed-row/ed-em-input/ed-tx-input riusano stili Slot esistenti dove possibile. |

### 3.2 Signature delle funzioni di editor

Tutte e tre seguono la stessa convenzione:

```js
export async function render<Gioco>EditorInto(host, ctx, onSaved)
// host:     DOM container (vuoto o sarà svuotato)
// ctx:      { client, me }   stesso che già gira tra i moduli
// onSaved:  callback opzionale, chiamato dopo save riuscito
//           — nell'hub Impostazioni: noop (resta nella stessa view)
//           — nei wrapper FAB: chiude il sheet e re-renderizza la pagina giochi
```

Restituiscono `Promise<void>`. Niente `openSheet` interno, niente `document.body.classList.add('locked')`. Pura mount inline.

### 3.3 Wrapper di compat per i FAB

Per non rompere i FAB ＋ sulla pagina Giochi, ogni gioco mantiene il vecchio entry point come **wrapper** sottile:

```js
// js/modules/giochi.js
function openEditor() {
  openSheet('Modifica i dadi', async s => {
    await renderSlotEditorInto(s, ctx, () => {
      s.closest('.modal').remove();
      document.body.classList.remove('locked');
      renderGiochi(ctx);
    });
  });
}
```

Idem `openEditorRuota()` in `ruota.js` e `openImpostazioni()` (cog) in `yahtzutra.js`.

### 3.4 Listener da rimuovere

In `js/modules/giochi.js` linee 17 e 23-27, e 43:

```js
let pendingContenuti = false;   // ← rimuovi
document.addEventListener('giochi:contenuti', async () => { ... });  // ← rimuovi (4 righe)
if (pendingContenuti) { pendingContenuti = false; openEditorRuota(); }  // ← rimuovi da renderGiochi()
```

Il dispatch da `impostazioni.js` viene anch'esso eliminato (non c'è più `goto`+`giochi:contenuti`).

---

## 4. UI / UX hub `openContenutiGiochi()`

### 4.1 Struttura DOM dentro `setBody`

```
.cg-head           (riusa stile .set-sec head con back-button)
├── button.set-back  "‹ Indietro"  → renderMain()
├── h2 "Contenuti giochi"
└── span.spacer      (allineamento)

.cg-tabs-wrap        (border-bottom oro 1px)
├── .cg-tabs
│   ├── button.cg-tab.on  (🎰 + "Slot")    data-tab="slot"
│   ├── button.cg-tab     (🎡 + "Ruota")   data-tab="ruota"
│   └── button.cg-tab     (🎲 + "Yahtzutra") data-tab="yz"
└── .cg-indicator     (linea oro 2px, width 33.33%, transizione left)

.cg-pane             (container dove monta l'editor del tab attivo)
```

### 4.2 Comportamento

- All'apertura: `cg-tab[data-tab="slot"].on`, `cg-indicator.left = 0%`, `renderSlotEditorInto(.cg-pane, ctx)`.
- Tap su altro tab:
  1. Toggle `.on` sul tab cliccato.
  2. `cg-indicator.style.left = (idx * 33.333) + '%'`.
  3. `clearNode(.cg-pane)` + `await render<X>EditorInto(.cg-pane, ctx)`.
  4. `.cg-pane.scrollTop = 0`.
- Tap su `‹ Indietro`: chiama `renderMain()` (la funzione già esistente di `impostazioni.js`).

### 4.3 Stile underline minimal (CSS sketch)

```css
.cg-tabs-wrap{position:relative;border-bottom:1px solid rgba(212,168,108,.18);margin:4px 0 18px;}
.cg-tabs{display:flex;justify-content:space-around;}
.cg-tab{flex:1;font-family:Arial;font-size:12px;letter-spacing:.4px;color:#a87e6a;
  padding:10px 4px 11px;background:transparent;border:0;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;gap:5px;transition:color .25s ease;}
.cg-tab .em{font-size:18px;line-height:1;}
.cg-tab.on{color:var(--gold-soft);}
.cg-indicator{position:absolute;bottom:-1px;height:2px;width:33.33%;left:0;
  background:linear-gradient(90deg,transparent,var(--gold),transparent);
  border-radius:2px;box-shadow:0 0 10px rgba(212,168,108,.6);
  transition:left .35s cubic-bezier(.17,.67,.18,1);}
```

---

## 5. Editor per gioco

### 5.1 Slot (`renderSlotEditorInto`)

Implementazione **estratta** da `openEditor()` corrente in `giochi.js:234-265`. Stesso DOM (sezioni Azione/Corpo/Dove, 6 righe ognuna, input emoji 42px + input testo), ma:

- Fetch dei dati: usa `facce` se già caricato (variabile modulo), altrimenti chiama `listDadiFacce` + `raggruppaFacce`.
- Save: per ogni faccia in `dirty` → `updateDadiFaccia`. Validazione testo non vuoto.
- Successo → `toast('Salvato', 'ok')` + `onSaved?.()`.
- **No** `document.body.classList`. **No** `openSheet`.

### 5.2 Ruota (`renderRuotaEditorInto`)

Implementazione **estratta** da `openEditorRuota()` corrente in `ruota.js:229+`. Stessa struttura editor spicchi. Stesse regole di sopra.

### 5.3 Yahtzutra (`renderYahtzutraEditorInto`)

Implementazione **estratta** da `openImpostazioni()` corrente in `yahtzutra.js:718+` (la parte editor — niente blocco "Abbandona partita", che resta dentro al sheet del cog di partita).

Layout per casella (13 totali, 6 numeri + separator + 7 combinazioni):

```
.yz-row
├── .yz-head
│   ├── .yz-nm   "Tris"              (nome casella)
│   └── .yz-val  "somma totale (3 uguali)"   (regola punteggio, sola lettura)
└── input.yz-az  "30s massaggio dove vuoi"   (azione spicy editabile)
```

Separator `— Combinazioni —` tra `n6` e `tris` (`.yz-sep`).

Save:
- Aggiorna l'oggetto `azioni` con i nuovi valori (validazione: testo non vuoto, default se vuoto).
- Chiama `saveAzioni()` (localStorage `yz-azioni-{couple_id}` — invariato).
- `toast('Yahtzutra salvato', 'ok')` + `onSaved?.()`.

Bottone **Ripristina default** sotto al Salva, identico a quello attuale (chiama `azioni = { ...DEFAULT_AZ }` + `saveAzioni()` + re-render).

### 5.4 Persistenza riassunta

| Gioco | Storage | Tabella / chiave | Cambio in questo redesign? |
|---|---|---|---|
| Slot | Supabase | `dadi_facce` | Nessuno |
| Ruota | Supabase | `ruota_spicchi` (o equivalente esistente) | Nessuno |
| Yahtzutra | `localStorage` | `yz-azioni-{couple_id}` | Nessuno (resta locale e per coppia) |

---

## 6. Test plan (manuale)

1. **Apertura hub:** Settings → Personalizza → tap "Contenuti dei giochi" → si apre la sotto-schermata con back, 3 tab, Slot acceso, editor Slot caricato.
2. **Switch tab:** Tap Ruota → indicator scorre liscio a 33.3%, editor Ruota renderizzato. Tap Yahtzutra → 66.6%, editor 13 caselle.
3. **Save Slot:** Modifica testo di una faccia, tap Salva → toast OK, riaprendo l'hub la modifica persiste.
4. **Save Ruota:** Modifica uno spicchio, Salva → toast OK + persistenza.
5. **Save Yahtzutra:** Modifica azione di "Tris", Salva → toast OK + persistenza (localStorage).
6. **Ripristina default Yahtzutra:** tap → tutte le azioni tornano DEFAULT_AZ, editor re-renderizzato.
7. **Back:** Tap `‹ Indietro` → torno alla schermata principale Impostazioni, foglio NON si chiude.
8. **FAB ＋ giochi:** Sulla pagina Giochi tab Slot → tap ＋ → apre l'editor Slot in modal (come oggi). Salva → chiude e refresca la slot. Idem Ruota e Yahtzutra cog.
9. **No regressione percorso vecchio:** confermare che il dispatch `giochi:contenuti` non esiste più (grep) e che la pagina Giochi non scatta più al tap della voce in Impostazioni.

---

## 7. Fuori scope

- Strip editor (nessun contenuto da modificare al momento).
- Cambio della persistenza Yahtzutra da localStorage a Supabase (rimandato a iterazione futura — non è quello che stiamo decidendo qui).
- Sincronizzazione real-time editor ↔ pagina giochi se l'altro partner sta modificando in contemporanea (best-effort: ultima save vince, come oggi).
- Editor Slot/Ruota/Yahtzutra di per sé (DOM, validazione, stili dei singoli campi): si **rinominano e si estraggono** ma non si redesignano.

---

## 8. Cose da decidere in fase di implementazione

Niente di bloccante. Punti minori che si chiariscono in implementazione:

- Esatto nome esportato (es. `renderSlotEditorInto` vs `mountSlotEditor`): si decide quando si scrive il codice, purché coerente tra i 3 moduli.
- Se l'indicator deve avere `width` calcolato dinamicamente sul bounding del tab (per supportare tab di larghezza diversa in futuro) o restare a `33.333%` fisso: la prima è più robusta, la seconda è più semplice e ok per 3 tab equispaziati. **Decisione spec: 33.333% fisso.** Se si aggiungerà Strip diventeranno 25%.
