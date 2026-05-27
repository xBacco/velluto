# Economia a giri + Ruota a premi — design

**Data:** 2026-05-27
**Autore:** Tomas Coronato (GitHub `xBacco`)
**Tipo:** design del pivot "economia a giri" per la web app di coppia "Velluto".
**Si appoggia a:** `2026-05-26-nostro-spazio-fase4-giochi-design.md` (§3.2 Ruota — **questo
documento la rimpiazza**), `2026-05-27-coupon-segreti-design.md` (i segreti si aprono
**solo** vincendo qui).
**Stato:** approvato (brainstorming + mockup chiusi), pronto per il piano di implementazione.

---

## 1. Scopo e idea

La feature "Coupon segreti" si è allargata a un sistema di gamification trasversale: una
**economia a giri**. Il "giro" è una **moneta** che si guadagna e si spende. L'unico modo
per spenderla è la **Ruota a premi**, che **rimpiazza** la vecchia "ruota settimanale"
(§3.2 della spec Fase 4, mai implementata): le 8 proposte piccanti di prima diventano
**un solo** premio fra otto.

Il senso del pivot: dare un ritmo e una piccola economia al rapporto. Non puoi aprire un
segreto quando vuoi — devi **vincerlo** alla ruota; e per girare devi avere un giro in
tasca (1 gratis a settimana, gli altri si vincono giocando).

**Vincolo trasversale (dalla Fase 4):** le meccaniche dei giochi non si ripetono. La ruota
è l'unico posto dove "gira la ruota"; i dadi tirano, le carte si pescano, ecc.

---

## 2. Decisioni chiuse in brainstorming (tutte approvate)

- **Moneta "giri".** Portafoglio **per persona** (intero ≥ 0). Si spende **1 giro** per
  girare la ruota.
- **Fonti dei giri:**
  1. **1 giro gratis a settimana** per persona (riusa la logica di cooldown, prima pensata
     come `ruotaEleggibile`).
  2. **Giri vinti giocando** (Strip Poker oggi, futuri giochi domani) tramite un **hook
     estensibile** `concediGiro`. Quanti giri dà ciascun gioco → **config**, da tarare
     quando i giochi esistono.
- **8 fette della ruota:** 💋 apri un segreto · 🔥 proposta piccante · 🎁 buono a sorpresa ·
  💌 pesca un desiderio · 🃏 carta Obbligo o Verità · ⭐ jolly scegli-tu · 🎲 tiro di dadi ·
  🔁 gira ancora.
  - La fetta **💋 apri un segreto** è "viva" **solo se** c'è una busta sigillata in attesa
    per chi gira; altrimenti resta disegnata ma **spenta** (peso 0, non vincibile, resa
    smorzata). Vedi §5.
- **Premi differiti vs immediati:**
  - **Differiti** — si **materializzano nelle tab**: `🎁 buono a sorpresa` → compare nei
    **Buoni**; `💌 pesca un desiderio` → desiderio **evidenziato** nei Desideri.
  - **Immediati** — si risolvono lì per lì nel pop-up premio (proposta piccante, carta ToD,
    tiro dadi, gira ancora, jolly) o avviano un flusso (apri segreto → scegli la busta).
- **Nessuna garanzia anti-sfortuna** sui segreti (scelta utente, sconsigliata due volte):
  puoi non vincere "apri segreto" per molti giri di fila. Accettato.
- **Tutti i numeri** (ogni quanto il gratis, costo del giro, giri per vittoria, pesi delle
  fette, lunghezza storico) stanno in **un blocco di costanti** `ECONOMIA`/`FETTE`,
  tarabili a sensazione dopo l'uso.

### UI bloccata (mockup approvati)

- **Ruota:** `conic-gradient` a spicchi **bordeaux alternati**, **rim e separatori oro**.
- **Emoji SEMPRE dritte**, anche durante e dopo il giro: orbitano con la ruota ma restano
  verticali (l'`inner` di ogni emoji è **contro-ruotato** di `-(angolo + rotazione)` con la
  **stessa transition** della ruota).
- **Pagina:** card in alto con **pallini-gettone a sinistra** (saldo giri) + "gratis tra
  Ng" a destra (mai "2/3"); **bottone ghost** velluto bordeaux con **bordo oro**
  "**GIRA LA RUOTA**", con il **costo come gettone** accanto; sotto, storico
  "**Ultimi premi**".
- **Spicchio vincente = spotlight:** un `conic-gradient` di overlay scurisce tutto tranne i
  ~45° in alto dove atterra il vincitore.
- **Pop-up premio:** **centrato esatto** nello schermo (`reveal` flex-center) ma **nasce
  dallo spicchio** con l'animazione **"Proiezione di luce" (variante 3)**: un **raggio** dal
  top verso il centro + la **card che si materializza** da sfocata a nitida. Contenuto:
  "Hai vinto" + **emoji grande** + nome + descrizione + **bottone azione contestuale**
  (es. "Scegli quale busta →") + **Chiudi**.
- **Modale aperta = sfondo fermo** (regola globale scroll-lock).
- **Mockup di riferimento** in `mockups/`: `ruota-bottone-stili.html` (pagina definitiva,
  variante A), `ruota-spicchio-stili.html` (spotlight), `ruota-popup-dallo-spicchio.html`
  (**scheda 3 = variante scelta**, interazione giro→spotlight→pop-up con emoji dritte).

---

## 3. Modello dati

### 3.1 Ledger dei giri — `giri_movimenti` (tabella nuova)

Il portafoglio non è un contatore mutabile: è un **ledger** di movimenti (come si fa con i
saldi). Il saldo di una persona = **somma dei `delta`**. Questo rende tutto **derivabile e
testabile**, dà gratis lo storico "Ultimi premi" e azzera i problemi di concorrenza
(insert-only, niente update di un contatore).

```
giri_movimenti (
  id        uuid pk default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,                 -- +1 accredito, -1 giro speso
  motivo    text not null check (motivo in ('settimanale','gioco','giro','ancora')),
  esito     text,                           -- chiave fetta vinta (solo per motivo='giro')
  creato    timestamptz not null default now()
)
```

| motivo | delta | quando | `esito` |
|---|---|---|---|
| `settimanale` | +1 | giro gratis maturato (1/settimana) | null |
| `gioco` | +1 | vinto giocando (hook `concediGiro`) | null |
| `giro` | −1 | hai girato la ruota | chiave della fetta vinta |
| `ancora` | +1 | premio "🔁 gira ancora" (rimborsa il giro) | null |

- **RLS:** policy `ALL` su `is_member(couple_id)`, come le altre tabelle di coppia.
- **`ruota_giri` è superata:** la tabella `ruota_giri` (presente nello schema ma **mai
  usata** da codice) viene **rimossa**. La migrazione la droppa.

### 3.2 Migrazione SQL — `supabase/giri.sql` (nuovo file)

```sql
-- Economia a giri: ledger dei movimenti. Rimpiazza la mai-usata ruota_giri.
drop table if exists ruota_giri cascade;

create table if not exists giri_movimenti (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id),
  user_id   uuid not null references auth.users(id),
  delta     int  not null,
  motivo    text not null check (motivo in ('settimanale','gioco','giro','ancora')),
  esito     text,
  creato    timestamptz not null default now()
);
create index if not exists giri_mov_couple_idx on giri_movimenti (couple_id, user_id, creato desc);

alter table giri_movimenti enable row level security;
create policy giri_mov_all on giri_movimenti
  for all using (is_member(couple_id)) with check (is_member(couple_id));
```

E si aggiorna `supabase/schema.sql` (installazioni nuove): si **rimuove** la tabella
`ruota_giri` e la sua policy `ruota_all`, si **aggiunge** `giri_movimenti` con la sua policy.

### 3.3 Cosa NON serve

I segreti vivono già nella tabella `buoni` (vedi spec segreti). Buoni/desideri vinti si
**materializzano** sulle tabelle esistenti (`buoni`, `desideri`) — nessuna colonna nuova lì.

---

## 4. Blocco di costanti (config) — `js/lib/logic.js`

Un solo posto per i numeri, da tarare dopo l'uso reale.

```js
export const ECONOMIA = {
  GRATIS_OGNI_GIORNI: 7,   // ogni quanto matura il giro gratis settimanale
  COSTO_GIRO: 1,           // giri spesi per girare la ruota
  GIRI_PER_VITTORIA: 1,    // accreditati vincendo un gioco (default hook concediGiro)
  ULTIMI_PREMI: 5,         // voci mostrate nello storico "Ultimi premi"
};

// Le 8 fette, in ordine sulla ruota. peso = probabilità relativa.
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',  peso: 1, soloSeSegreti: true, differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante', peso: 1 },
  { key: 'buono',     emoji: '🎁', label: 'Buono a sorpresa',  peso: 1, differito: true },
  { key: 'desiderio', emoji: '💌', label: 'Pesca un desiderio', peso: 1, differito: true },
  { key: 'tod',       emoji: '🃏', label: 'Carta Obbligo o Verità', peso: 1 },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',  peso: 1 },
  { key: 'dadi',      emoji: '🎲', label: 'Tiro di dadi',      peso: 1 },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',       peso: 1 },
];

// Proposte piccanti (le 8 della vecchia ruota settimanale → diventano UN premio: ne pesca una).
export const PROPOSTE_PICCANTI = [
  '…', // 8 frasi hardcoded, stile contenuti dei dadi. Da rifinire con l'utente.
];

// Buoni a sorpresa: pool da cui materializzare un regalo per chi vince la fetta 🎁.
export const BUONI_SORPRESA = [
  // { emoji, titolo, descrizione } — da rifinire con l'utente.
];
```

---

## 5. Logica pura (`js/lib/logic.js`) — funzioni nuove, testabili

Tutte pure (dati in → dati out), `now`/`rnd` iniettabili dove serve. Stile dei filtri/funzioni già presenti.

- **`saldoGiri(movimenti, userId)`** → `Σ delta` dei movimenti di quell'utente (intero ≥ 0).
- **`puoGirare(saldo)`** → `saldo >= ECONOMIA.COSTO_GIRO`.
- **`giriEleggibile(movimenti, userId, now)`** → `{ ok, prossimoSblocco }` per il **gratis
  settimanale**: guarda il movimento `motivo==='settimanale'` più recente dell'utente;
  `ok = now − ultimo ≥ GRATIS_OGNI_GIORNI giorni` (o nessun movimento). `prossimoSblocco` =
  data del prossimo gratis. (È la funzione un tempo chiamata `ruotaEleggibile`, ora sui movimenti.)
- **`fetteRuota(haSegretoInAttesa)`** → copia di `FETTE` con il **peso della fetta `segreto`
  forzato a 0** se `!haSegretoInAttesa` (resta nell'array per la geometria: 8 spicchi sempre).
- **`estraiFetta(fette, rnd = Math.random)`** → estrazione **pesata** (salta peso 0) →
  `{ indice, fetta }`. `indice` serve al modulo per calcolare l'angolo di atterraggio.
- **`ultimiPremi(movimenti, userId, n = ECONOMIA.ULTIMI_PREMI)`** → ultimi `n` movimenti
  `motivo==='giro'` dell'utente, ordinati per data desc, con la fetta risolta da `esito`.

> Nota: l'**angolo di atterraggio** e l'animazione (spotlight, proiezione di luce, emoji
> contro-ruotate) sono UI → vivono nel modulo, non in `logic.js`.

---

## 6. `js/store.js` — funzioni nuove (client iniettato, `check({data,error})`)

Nessun fallimento silenzioso: errore → eccezione → toast nel modulo.

- **`listGiri(client, coupleId)`** → tutti i `giri_movimenti` della coppia (per saldo +
  storico di entrambi).
- **`accreditaGiro(client, { couple_id, user_id, motivo })`** → insert `delta: +1` con
  `motivo ∈ {'settimanale','gioco','ancora'}`.
- **`spendiGiro(client, { couple_id, user_id, esito })`** → insert `delta: -1`,
  `motivo:'giro'`, `esito`. **Una sola insert** = registra spesa **e** premio vinto.
- **`concediGiro(client, { couple_id, user_id })`** → **hook** per i giochi: accredita
  `ECONOMIA.GIRI_PER_VITTORIA` con `motivo:'gioco'`. Lo chiamano i moduli-gioco quando
  qualcuno vince (oggi Strip Poker; domani altri). Wrapper sottile su `accreditaGiro`.

> **Concorrenza/atomicità:** essendo insert-only, la "spesa" non è un decremento da
> proteggere. Il modulo controlla `puoGirare(saldo)` **prima** di girare; un eventuale
> doppio-tap è bloccato dal flag `busy` (come nei Dadi). Saldo negativo impossibile a UI;
> se per corsa estrema due insert −1 partissero insieme, il saldo si auto-corregge alla
> lettura successiva ed è solo cosmetico. **YAGNI**: niente lock/transazioni server.

---

## 7. Modulo render — `js/modules/ruota.js` (nuovo)

Stessa firma e stile degli altri moduli (`renderX({ client, me, panel })`, wiring
`fab:<tab>` una volta, disegno via `mk/add/clear`, **no `innerHTML`**, errori via `toast`,
scrim centrato + `body.locked` come i Dadi).

### 7.1 Collocazione

La Ruota è **uno dei giochi** dentro la tab **Giochi**: `giochi.js` ottiene un selettore tra
i giochi (Dadi, Ruota, …) e monta la Ruota delegando a `ruota.js` (come la Fase 4 prevede di
delegare ToD e Strip a sotto-moduli). In questa sotto-fase il selettore può avere **Dadi +
Ruota**; gli altri giochi si aggiungono quando esistono.

### 7.2 Caricamento e disegno

1. `listGiri` → calcola `saldo = saldoGiri(mov, me)` e `{ ok, prossimoSblocco } =
   giriEleggibile(mov, me, now)`.
2. Se `ok`, **matura il gratis**: `accreditaGiro({ motivo:'settimanale' })`, poi ricarica.
   (Maturazione **pigra**, all'apertura — niente cron.)
3. Determina `haSegretoInAttesa = segretiDaRivelare(buoni, me).length > 0` (richiede i
   `buoni`; vedi spec segreti) → `fette = fetteRuota(haSegretoInAttesa)`.
4. Disegna: card saldo (pallini-gettone = saldo, "gratis tra Ng" = countdown da
   `prossimoSblocco`), la ruota (8 spicchi, emoji dritte), il bottone ghost "GIRA LA RUOTA"
   (disabilitato se `!puoGirare(saldo)`), lo storico `ultimiPremi`.

### 7.3 Giro

1. Guardia `busy` + `puoGirare(saldo)`.
2. `{ indice, fetta } = estraiFetta(fette)`.
3. `spendiGiro({ esito: fetta.key })` (registra −1 e il premio).
4. Anima: rotazione fino a portare `indice` sotto l'indicatore in alto → **spotlight** sullo
   spicchio → **pop-up "proiezione di luce"** dallo spicchio al centro.
5. Risolvi il premio (§8), poi ridisegna (saldo aggiornato, storico aggiornato, eventuale
   countdown).

### 7.4 Wiring in `app.js`

Come da Fase 4: `renderGiochi` resta il contenitore della tab Giochi e instrada al
sotto-modulo Ruota. Nessuna nuova voce di navigazione (la Ruota sta **dentro** Giochi).

---

## 8. Risoluzione dei premi

Il pop-up mostra sempre "Hai vinto" + emoji + label; il **bottone azione** e l'effetto
dipendono dalla fetta:

| fetta | tipo | cosa fa | dipendenze |
|---|---|---|---|
| 💋 `segreto` | flusso | bottone "**Scegli quale busta →**" → apre la scelta tra i segreti in attesa; alla scelta parte l'animazione-busta e la transizione `'rivela'` | spec **segreti** |
| 🔥 `piccante` | immediato | mostra **una** proposta a caso da `PROPOSTE_PICCANTI` | nessuna |
| 🎁 `buono` | **differito** | materializza un **regalo** nei Buoni: `addBuono({ tipo:'regalo', stato:'attivo', a_id:me, da_id:partner, …pool BUONI_SORPRESA })`; il pop-up dice "lo trovi nei Buoni" | `addBuono` |
| 💌 `desiderio` | **differito** | pesca un desiderio `da_provare` a caso e lo **evidenzia** nei Desideri; pop-up "te l'abbiamo scelto noi" | tab Desideri |
| 🃏 `tod` | immediato | pesca una **carta** a caso (`pescaCarta`) e la mostra nel pop-up | `listCarte` + `pescaCarta` (carte esistono nel DB; modulo ToD non necessario) |
| ⭐ `jolly` | scelta | bottone "**Scegli tu →**" → l'utente sceglie uno degli altri premi | — |
| 🎲 `dadi` | immediato | tira i dadi e mostra l'esito (riusa `tiraDadi`/`componiFrase`) | Dadi (già fatto) |
| 🔁 `ancora` | immediato | `accreditaGiro({ motivo:'ancora' })` (+1) → di fatto **giro gratis**; pop-up "Gira ancora!" | nessuna |

- I premi **differiti** non interrompono: confermano nel pop-up e l'utente li ritrova in tab.
- I premi che dipendono da **moduli non ancora costruiti** (ToD pieno, Strip) usano solo il
  minimo necessario (per ToD: lettura carte + pesca; nessun modulo ToD richiesto). La fonte
  di giri dai giochi (`concediGiro`) si **aggancia quando il gioco esiste**.

---

## 9. Hook "guadagnare giri dai giochi" (estensibile)

- I giochi che hanno un **vincitore** chiamano `concediGiro(client, { couple_id, user_id })`
  alla vittoria. Oggi: **Strip Poker** (quando si chiude una partita → +`GIRI_PER_VITTORIA`
  al vincitore). Domani: altri giochi.
- **Quanti** giri dà ciascun gioco e **a quali** condizioni è una scelta di bilanciamento da
  fare **quando il gioco esiste** → valori in `ECONOMIA` (o una mappa per-gioco se servirà).
- Questo mantiene l'economia **aperta all'estensione** senza decidere ora numeri su giochi
  non costruiti (vedi §12 Domande aperte).

---

## 10. Gestione errori

- `listGiri` protetto da try/catch + toast (come `listDadiFacce`).
- `spendiGiro` fallisce → il giro **non parte** (toast "Errore"), saldo invariato.
- Maturazione gratis (`accreditaGiro 'settimanale'`) fallisce → nessun blocco: si riproverà
  alla prossima apertura (fallimento silenzioso accettabile, è solo un accredito cosmetico
  che recupera da sé al prossimo render).
- Premi differiti: se la materializzazione (`addBuono`) fallisce **dopo** lo `spendiGiro`,
  toast "Errore: premio non salvato, riprova dal …" — il giro resta speso (l'`esito` è già
  registrato). **Compromesso accettato**: l'`esito` nel ledger è la fonte di verità, la
  materializzazione è un effetto. (Alternativa con transazione = YAGNI.)

---

## 11. Testing (TDD)

**Unit (`node --test`)** sulle funzioni pure §5, stile `test/buoni.test.js`/`logic`:

- `saldoGiri`: somma corretta di accrediti/spese; 0 senza movimenti; mai conta l'altro utente.
- `giriEleggibile`: `ok` senza movimenti; in cooldown con `prossimoSblocco` corretto; al
  confine dei 7 giorni (`now` iniettato).
- `fetteRuota`: peso `segreto` = 0 quando niente buste, > 0 quando ce n'è; sempre 8 fette.
- `estraiFetta`: con `rnd` deterministico atterra sulla fetta attesa; **non** estrae mai una
  fetta a peso 0; copre l'intervallo.
- `ultimiPremi`: ordina per data desc, taglia a `n`, solo `motivo==='giro'`, solo dell'utente.

**Store** con client Supabase **finto iniettato**: `accreditaGiro`/`spendiGiro`/`concediGiro`
fanno l'insert giusto (delta, motivo, esito); `listGiri` mappa le righe.

**Smoke Playwright** prima di "fatto": la Ruota gira, scala il saldo, mostra il pop-up dallo
spicchio con **emoji dritte**; si **blocca** a saldo 0; il gratis matura quando dovuto; un
premio differito (buono) **compare** nei Buoni; "apri segreto" appare **solo** con una busta
in attesa; storico "Ultimi premi" si aggiorna; layout mobile corretto; persistenza dopo reload.

---

## 12. Domande aperte (da chiudere con l'utente)

1. **Contenuti `PROPOSTE_PICCANTI`** (le 8 frasi) e **`BUONI_SORPRESA`** (pool del regalo a
   sorpresa): vanno scritti con l'utente (stile contenuti dei dadi).
2. **Pesi delle fette**: ora tutti = 1 (uniforme). Tarare dopo l'uso (es. "apri segreto" più
   raro?).
3. **Giri per vittoria per-gioco**: definire quando i giochi esistono (ora unico
   `GIRI_PER_VITTORIA`).
4. **Fetta 🃏 ToD a mazzo vuoto**: se la coppia non ha ancora carte, cosa mostra il pop-up?
   (proposta: messaggio "aggiungi carte in Obbligo o Verità" + nessun premio perso, oppure
   ri-tira). Da decidere.

---

## 13. Fuori scope (YAGNI)

- Niente cron/scheduler: il gratis matura **pigro** all'apertura.
- Niente transazioni/lock server sul saldo (ledger insert-only + guardia UI bastano).
- Niente scambio/regalo di giri tra i due partner.
- Niente storico "movimenti" completo a UI (solo "Ultimi premi" = le vincite).
- Niente notifiche push/email.
