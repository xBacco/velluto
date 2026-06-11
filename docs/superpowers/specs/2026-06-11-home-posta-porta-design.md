# La Porta — guscio d'ingresso (lucchetto + biometria) — design

**Data:** 2026-06-11
**Roadmap:** trasversale ai passi 6–7 di `docs/audit-2026-06-05-verdetto.md` (il guscio
che incornicia La Posta). La porta **sostituisce il gate `requireUnlock` esistente**, non
la logica del lucchetto.
**A monte:**
- `js/lib/lock.js` già esiste e funziona: PIN locale (localStorage, SHA-256, 4–6 cifre) +
  biometria via **WebAuthn platform authenticator**. Test `test/lock.test.js` verdi.
- Gate attuale: `requireUnlock()` in `js/app.js:173` (markup `#lockgate` in `index.html`),
  chiamato da `enterApp()` quando `isLockEnabled()`. È la UI da ridisegnare.
- Impostazioni già gestiscono PIN on/off, bio on/off, modalità pudica (`js/modules/impostazioni.js`).
**Vincoli:** direzione visiva CONGELATA in `CLAUDE.md` (ember azione, oro struttura,
Fraunces/Nunito, mono confinato ai valori, Caveat solo voce di lei, copy umano).
**Stato:** ✅ approvato dall'utente (brainstorming con visual companion, sessioni 2026-06-10/11).

## Cosa si costruisce

Il **guscio d'ingresso di brace**: la schermata-porta che si frappone tra l'avvio e la
home. Tre pezzi:

1. **La porta-lucchetto** — redesign della UI di `requireUnlock`: anta scolpita, spioncino,
   gesto di avvicinamento alla serratura, tastierino notturno, conferma «sei a casa»,
   apertura a battente sulla home. Stessa logica (`verifyPin`/`unlockBio`), nuova veste.
2. **L'attivazione biometrica al primo ingresso** — un bottom sheet che, *dopo* il primo
   sblocco riuscito, propone Face ID / impronta; se accetti parte la scansione di sistema
   (WebAuthn) e poi conferma. Poi la biometria vive nelle Impostazioni.
3. **La frequenza di sblocco configurabile** — default "a ogni apertura", con opzioni più
   morbide nelle Impostazioni.

Niente di tutto questo tocca lo schema Supabase: il lucchetto è **per-dispositivo**.

## Decisioni del brainstorming (companion, 2026-06-10/11)

1. **Guscio = porta, hub unico.** La porta è l'unica soglia d'ingresso; supera il vecchio
   gate terminale. Apre direttamente sulla home (La Posta, quando portata: passi 6–7).
2. **PIN = lucchetto LOCALE**, non barriera crittografica. Vive sopra la sessione Supabase
   (che resta valida): è una tenda di privacy contro chi ha in mano il telefono, non una
   cifratura dei dati. (Vedi "Nota tecnica onesta".)
3. **Frequenza:** default **a ogni apertura**; l'utente sceglie dalle Impostazioni tra più
   opzioni (sotto). Biometria come scorciatoia, mai come unico fattore.
4. **Estetica anta = "Sartoriale"** (`mockups/porta-estetica-lab.html`, opzione 1): due
   pannelli a rilievo, bordeaux caldo, ottone vivo. Scartate: portone d'epoca, essenziale.
5. **Spioncino = "A · ottone classico", PICCOLO e in scala reale** con l'anta
   (`mockups/porta-spioncino-lab.html`). La brace filtra da dentro («lei è lì»). Scartati:
   scanalato vintage, a filo moderno.
6. **Gesto = porta "A" + entrata placca "E1"** (`mockups/porta-rifinita.html`): tocchi la
   porta → avvicinamento alla **serratura** (dolly+pan, 1.55s), la placca **esce dalla
   serratura** e arriva al centro; un gesto unico (porta/placca/blur/buio stesso tempo e
   curva).
7. **Tastierino notturno:** cifre grigie a riposo, si accende **solo** il tasto premuto;
   tasto in basso a sx contestuale **✺ (impronta a vuoto) → ⌫ (cancella con cifre)**;
   conferma con **✓**.
8. **Conferma codice giusto = «sei a casa»** (Fraunces 600, 15px, ember; non Caveat, non
   "cartellone"), poi la porta gira sui cardini (battente) sulla home.
9. **Via il bottone "Face ID / impronta" dal fondo del lucchetto.** La biometria non è più
   un bottone permanente lì: si attiva al primo ingresso (decisione 10) e poi sta nelle
   Impostazioni. *(In fase di sblocco, se la biometria è già attiva, parte comunque in
   automatico — vedi architettura.)*
10. **Banner di attivazione al primo ingresso = "Bottom sheet" migliorato**
    (`mockups/biometria-attiva-flusso.html`): titolo «Entra con un tocco», beneficio +
    «il codice resta la riserva», riga rassicurazione «🔒 Il riconoscimento resta sul tuo
    telefono», **Attiva** (ember) / **Non ora**. Su **Attiva** parte la **scansione** secondo
    il device: viso (Face ID), impronta (Touch), o scelta se ci sono entrambi → poi «Fatto».
    Scartati: modale centrata, banner inline.

## Mockup di riferimento (artefatti gitignored, sono la verità visiva)

| Mockup | Cosa fissa |
|---|---|
| `mockups/porta-rifinita.html` | Gesto A + entrata E1 + tastierino ✺/⌫ + «sei a casa» |
| `mockups/porta-estetica-lab.html` | Anta **Sartoriale** (opzione 1) |
| `mockups/porta-spioncino-lab.html` | Spioncino **A** classico, reso poi **piccolo** in `porta-estetica-lab` |
| `mockups/biometria-attiva-flusso.html` | Bottom sheet migliorato + flusso scansione (viso/impronta/entrambi) |

## Gli stati della porta (macchina a stati della UI)

```
riposo      → porta intera, spioncino caldo, hint «Tocca la porta per avvicinarti»
avvicinata  → zoom A alla serratura; la placca (E1) arriva al centro; tastierino attivo
digitazione → solo il tasto premuto si accende; ✺ diventa ⌫ appena c'è ≥1 cifra
errato      → shake + pip rossi → reset cifre, hint «Codice errato»
giusto      → ✓ → «sei a casa» (ember) → unlocked
aperta      → anta gira sui cardini (battente) → la home si rivela → gate via
```

- Biometria, se già attiva: tentata **in automatico all'avvicinamento** (come fa oggi
  `requireUnlock` con `bio.click()`), senza bottone visibile. Fallback sempre = codice.
- `✺` a vuoto = scorciatoia biometrica (se attiva); con cifre presenti = cancella ultima.

## Estetica congelata (riassunto operativo)

- **Anta Sartoriale:** due pannelli a rilievo, venatura verticale, bordeaux caldo
  (`--wood`), cerniere + maniglia/serratura in ottone (`--brass-*`), badge smart-lock
  discreto con LED che respira.
- **Spioncino A piccolo:** Ø ~15px in scala con l'anta, fisheye d'ottone, nucleo brace
  caldo, alone ember tenue, micro-animazione `peepwarm`.
- **Tastierino notturno (placca "pudica"):** sfondo burgundy, cifre `rgba(247,231,226,.5)`
  a riposo, premuto in flare ember; `✓` pulsa quando il codice è "pronto" (4+ cifre).
- **Token:** solo `var(--ds-*)` e i `--brass-*` di `porta.css`. Numeri/cifre in mono;
  parole in Fraunces/Nunito. Nessun font deprecato; Caveat **assente** (è UI, non voce di lei).

## Biometria

### Primo ingresso (bottom sheet)
Condizione di comparsa, **dopo il primo sblocco riuscito**:
```
isLockEnabled() && bioSupported() && !isBioEnabled() && !lock.bioPrompted
```
- **Attiva** → chiama `enableBio()` (oggi in `lock.js`): è `navigator.credentials.create`
  con `authenticatorAttachment:'platform'`, `userVerification:'required'` → **il sistema
  operativo disegna la scansione** (Face ID / Touch / impronta). Al resolve: stato «Fatto»
  + `lock.bio = true`. Poi set `lock.bioPrompted = true`.
- **Non ora** → set `lock.bioPrompted = true` (non si re-insiste a ogni apertura). Resta
  attivabile dalle Impostazioni.
- Caso "entrambi": chooser brace «Viso / Impronta» → poi `enableBio()` (il device sceglie
  comunque il suo platform authenticator; il chooser è un affordance, non vincola l'OS).

### A regime (Impostazioni)
Nessun cambiamento al modello già esistente: toggle biometria in `impostazioni.js`
(gated su PIN attivo + `bioSupported`), `enableBio`/`disableBio`. Il bottom sheet è solo un
**secondo punto d'ingresso** a `enableBio()`, non una logica nuova.

## Frequenza di sblocco (nuova impostazione)

Oggi `enterApp()` chiama `requireUnlock()` a ogni avvio se il lock è attivo. Si aggiunge una
politica scelta dall'utente, salvata nel record lock locale:

| Opzione | Comportamento | Default |
|---|---|---|
| **A ogni apertura** | Sempre, come oggi | ✅ |
| **Dopo inattività (N min)** | Riblocca solo se `now − lastUnlockAt > N·60s` (grace period) | |
| **Solo all'avvio** | Solo a cold start (nuovo load); il rientro dal background non riblocca | |

- Nuovi campi nel record `lussuria.lock`: `freq` (`'apertura' | 'grazia' | 'avvio'`),
  `graceMin` (default 5), `lastUnlockAt` (epoch ms, scritto a ogni sblocco riuscito).
- `shouldLock()` (nuova, pura, in `lock.js`, **testabile**): prende `freq`, `lastUnlockAt`,
  `now`, e un flag `coldStart` → ritorna bool. `enterApp` la consulta invece del solo
  `isLockEnabled()`.
- Cold start vs rientro: un flag in `sessionStorage` distingue il primo load della sessione
  di runtime dai successivi (per 'avvio'); per 'grazia' si usa `lastUnlockAt`.

## Architettura

### Riuso (niente da riscrivere)
`js/lib/lock.js` resta il motore: `isLockEnabled`, `setPin`, `verifyPin`, `disableLock`,
`bioSupported`, `isBioEnabled`, `enableBio`, `disableBio`, `unlockBio`, `getPudica`/`setPudica`.

### Estensioni a `js/lib/lock.js` (piccole, pure, testabili)
1. `bioPrompted` get/set nel record lock (default false).
2. `freq` + `graceMin` + `lastUnlockAt` get/set; `touchUnlock(now)` scrive `lastUnlockAt`.
3. `shouldLock({ freq, lastUnlockAt, graceMin, coldStart, now })` → bool (funzione pura).

### `index.html` — markup `#lockgate`
Sostituire il gate piatto attuale con la struttura porta (anta + placca + tastierino +
pannello hint), classi e CSS portati da `mockups/lib/porta.css` + `porta.html`. Il bottom
sheet biometrico è un overlay figlio del gate (o dell'app subito dopo l'apertura).

### `js/app.js` — `requireUnlock()` ridisegnata
- Stesso contratto (ritorna una Promise che risolve allo sblocco), nuova UI a stati.
- Cablaggio gesto/tastierino: adattare la logica di `mockups/lib/porta.js` (zoom, accensione
  tasto singolo, ✺/⌫, ✓) chiamando `verifyPin` sul codice e `unlockBio` per la biometria.
- Allo sblocco: `touchUnlock(Date.now())`, poi (se condizione) mostra il bottom sheet
  biometrico **prima** di scoprire del tutto la home, o subito dopo l'apertura a battente.
- `enterApp`: `if (shouldLock(...)) await requireUnlock();` al posto di `if (isLockEnabled())`.

### `js/modules/impostazioni.js`
Aggiungere la riga "Quando richiedere il codice" (3 opzioni) sotto il toggle PIN. Nessun
altro cambiamento ai toggle esistenti.

### CSS
Gli stili porta vivono in un file dedicato linkato dall'app (es. `css/porta.css`, derivato
da `mockups/lib/porta.css` + le rifiniture inline di `porta-rifinita`/`porta-estetica`),
sui token `--ds-*`. Vincolo WebView noto del progetto: niente `calc()` negli angoli dei
`conic-gradient`.

## Nota tecnica onesta (modello di minaccia + biometria PWA)

- **Il PIN è un lucchetto soffice, non una cifratura.** I dati restano dietro la sessione
  Supabase + RLS; il PIN impedisce l'accesso casuale all'app su un telefono già sbloccato.
  Non protegge da un attaccante determinato con il dispositivo in mano e i devtools (è una
  PWA: `localStorage` è ispezionabile). È esattamente il livello di garanzia delle "app lock"
  delle gallerie/note — e va comunicato così, senza promettere di più.
- **La scansione biometrica è disegnata dall'OS**, non da brace: `enableBio`/`unlockBio`
  usano WebAuthn platform authenticator. Le animazioni di scansione nei mockup
  *rappresentano* quel momento di sistema. Nell'app reale brace possiede l'**invito**
  (bottom sheet) e la **conferma** «Fatto»; in mezzo c'è la UI nativa di Face ID/impronta.
- **WebAuthn richiede contesto sicuro** (https / localhost) e un platform authenticator
  registrato: su device senza biometria `bioSupported()` è false e il bottom sheet non
  compare.

## Testing

- `test/lock.test.js` (già verde) resta la rete del motore. Aggiungere:
  - `shouldLock`: tutti i rami (apertura sempre; grazia entro/oltre N min; avvio solo a
    coldStart; lock disattivo → false).
  - `bioPrompted` e `freq`/`graceMin`/`lastUnlockAt`/`touchUnlock`: get/set e default.
- La UI della porta è DOM → si testa la **logica estraibile** (riduttore del codice:
  aggiunta cifra, cap a 6, ✺↔⌫, "pronto" a 4+) come funzione pura, più **smoke su device**
  (come gli smoke esistenti): comparsa porta → zoom → codice giusto/errato → «sei a casa» →
  apertura → home; biometria: primo ingresso → Attiva → scansione OS → «Fatto»; rientri
  successivi → sblocco bio automatico.
- Suite intera verde (`node --test`), nessuna regressione sui test attuali.

## Edge / robustezza

- `bioSupported()` false → nessun ✺ biometrico, nessun bottom sheet; solo codice.
- Utente annulla la scansione OS (`enableBio`/`unlockBio` reject) → resta sul codice; il
  bottom sheet mostra di nuovo l'invito (non «Fatto»); nessun crash.
- Lock disattivo (`isLockEnabled()` false) → la porta-lucchetto non compare (vedi "Fuori
  scope" per la porta decorativa senza PIN).
- `lastUnlockAt` assente (primo uso) → 'grazia' tratta come "riblocca" (richiede codice).
- Modalità pudica indipendente dal lock (resta gestita com'è).
- Reduce-motion: il gesto zoom/battente va degradato (transizione breve) — da rispettare nel CSS.

## Definition of done (regole di sessione)

Commit + suite verde (`node --test`), **poi** smoke su device: porta che apre col codice e
con la biometria, bottom sheet al primo ingresso, le 3 frequenze. Solo allora "fatto".

## Fuori scope (YAGNI)

- **Port della home La Posta** dietro la porta (passi 6–7, spec proprie): qui la porta
  *apre su* `showHome()` così com'è; l'unificazione col vecchio overlay camera è altro lavoro.
- **Porta decorativa senza PIN** (soglia "tocca per entrare" quando il lock è off):
  rimandata. Default: lock off → nessuna porta, si entra diretti. Da decidere se/in seguito.
- Cambio PIN dimenticato / recupero (oggi: disattiva+riattiva da Impostazioni — invariato).
- Sincronizzazione del lock tra dispositivi (è per-dispositivo by design).
- Più di un credenziale biometrica per device; gestione multi-utente del platform authenticator.
