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
  - Alcune fette sono **condizionali**: **💋 apri un segreto** (viva solo con una busta in
    attesa), **🃏 carta ToD** (viva solo con almeno una carta), e **🔥/🎁** (vive solo se la
    rispettiva lista editabile non è vuota). Quando la condizione manca, la fetta resta
    disegnata ma **spenta** (peso 0, non vincibile, resa smorzata). Vedi §5 `fetteRuota`.
  - **Pesi:** tutti uguali (peso 1) per ora — si tara dopo aver provato la ruota dal vivo.
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
- **Contenuti editabili dalla coppia (scelta utente 2026-05-27):** le **proposte piccanti**
  (fetta 🔥) e i **buoni a sorpresa** (fetta 🎁) **non** sono hardcoded: vivono su Supabase,
  **modificabili in qualsiasi momento** dall'app (aggiungi/modifica/elimina), come i Dadi e
  i Tipi. Le liste in `logic.js` restano solo come **default seminati** alla prima apertura.

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

### 3.2 Contenuti editabili — `ruota_contenuti` (tabella nuova)

Le liste delle fette 🔥 e 🎁 sono **per coppia ed editabili** (come `dadi_facce`/`tipi`):
una sola tabella generica con una `categoria`.

```
ruota_contenuti (
  id          uuid pk default gen_random_uuid(),
  couple_id   uuid not null references couples(id),
  categoria   text not null check (categoria in ('piccante','buono')),
  emoji       text,                 -- solo 'buono' (es. 💆); null per 'piccante'
  testo       text not null,        -- 'piccante': la frase; 'buono': il titolo
  descrizione text,                 -- solo 'buono': il corpo del coupon
  ordine      int  not null default 0,
  creato      timestamptz not null default now()
)
```

- **Seeding pigro:** alla prima apertura della Ruota, se la coppia non ha righe, si
  seminano i **default** da `logic.js` (come fa `giochi.js` con `seedDadiFacce`).
- **RLS:** policy `ALL` su `is_member(couple_id)`.

### 3.3 Migrazione SQL — `supabase/giri.sql` (nuovo file)

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

-- Contenuti editabili delle fette 🔥/🎁.
create table if not exists ruota_contenuti (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id),
  categoria   text not null check (categoria in ('piccante','buono')),
  emoji       text,
  testo       text not null,
  descrizione text,
  ordine      int  not null default 0,
  creato      timestamptz not null default now()
);
create index if not exists ruota_cont_idx on ruota_contenuti (couple_id, categoria, ordine);

alter table ruota_contenuti enable row level security;
create policy ruota_cont_all on ruota_contenuti
  for all using (is_member(couple_id)) with check (is_member(couple_id));
```

E si aggiorna `supabase/schema.sql` (installazioni nuove): si **rimuove** la tabella
`ruota_giri` e la sua policy `ruota_all`, si **aggiungono** `giri_movimenti` e
`ruota_contenuti` con le rispettive policy.

### 3.4 Cosa NON serve

I segreti vivono già nella tabella `buoni` (vedi spec segreti). Buoni/desideri vinti si
**materializzano** sulle tabelle esistenti (`buoni`, `desideri`) — nessuna colonna nuova lì.

---

## 4. Blocco di costanti (config) — `js/lib/logic.js`

Un solo posto per i numeri, da tarare dopo l'uso reale.

```js
export const ECONOMIA = {
  GRATIS_OGNI_GIORNI: 7,   // ogni quanto matura il giro gratis settimanale
  COSTO_GIRO: 1,           // giri spesi per girare la ruota
  GIRI_PER_VITTORIA: 1,    // PROVVISORIO: accreditati vincendo un gioco (hook concediGiro).
                           // I giochi potranno dare giri O altri premi → si tara/estende
                           // quando i giochi esistono (vedi §9, §12).
  ULTIMI_PREMI: 5,         // voci mostrate nello storico "Ultimi premi"
};

// Le 8 fette, in ordine sulla ruota. peso = probabilità relativa.
export const FETTE = [
  { key: 'segreto',   emoji: '💋', label: 'Apri un segreto',  peso: 1, soloSeSegreti: true, differito: false },
  { key: 'piccante',  emoji: '🔥', label: 'Proposta piccante', peso: 1 },
  { key: 'buono',     emoji: '🎁', label: 'Buono a sorpresa',  peso: 1, differito: true },
  { key: 'desiderio', emoji: '💌', label: 'Pesca un desiderio', peso: 1, differito: true },
  { key: 'tod',       emoji: '🃏', label: 'Carta Obbligo o Verità', peso: 1, soloSeCarte: true },
  { key: 'jolly',     emoji: '⭐', label: 'Jolly: scegli tu',  peso: 1 },
  { key: 'dadi',      emoji: '🎲', label: 'Tiro di dadi',      peso: 1 },
  { key: 'ancora',    emoji: '🔁', label: 'Gira ancora',       peso: 1 },
];

// SOLO DEFAULT di seeding: i contenuti veri vivono in `ruota_contenuti` (editabili dalla
// coppia in qualsiasi momento). Approvati dall'utente il 2026-05-27.
export const PROPOSTE_PICCANTI_DEFAULT = [
  'Spogliatevi a vicenda, lentamente, senza dire una parola.',
  'Massaggio con l’olio: dieci minuti a testa, niente fretta.',
  'Uno dei due bendato: si lascia guidare solo dal tatto.',
  'Doccia insieme, luci basse.',
  'Chi ha girato detta le regole per i prossimi dieci minuti.',
  'Un bacio lungo un minuto intero — mani dietro la schiena.',
  'Raccontatevi una fantasia che non vi siete mai detti.',
  'Striptease privato: una canzone intera, pubblico di una persona.',
];

export const BUONI_SORPRESA_DEFAULT = [
  { emoji: '💆', titolo: 'Massaggio completo', descrizione: 'Quindici minuti di massaggio, quando lo riscatti.' },
  { emoji: '🛁', titolo: 'Bagno caldo preparato', descrizione: 'Te lo prepara il partner, candele incluse.' },
  { emoji: '😈', titolo: 'Un sì garantito',      descrizione: 'Una richiesta piccante a tua scelta, senza poter dire di no.' },
  { emoji: '🎬', titolo: 'Serata, scegli tu',    descrizione: 'Film e coccole decisi da te, per una sera.' },
  { emoji: '💋', titolo: 'Tre voglie express',   descrizione: 'Tre piccoli desideri esauditi stasera.' },
  { emoji: '🍳', titolo: 'Colazione a letto',    descrizione: 'Una mattina a tua scelta, te la porta il partner.' },
];
```

> I default servono **solo** a seminare `ruota_contenuti` la prima volta. Da lì in poi la
> fonte di verità è il DB e l'utente li modifica dall'editor (§7.5).

---

## 5. Logica pura (`js/lib/logic.js`) — funzioni nuove, testabili

Tutte pure (dati in → dati out), `now`/`rnd` iniettabili dove serve. Stile dei filtri/funzioni già presenti.

- **`saldoGiri(movimenti, userId)`** → `Σ delta` dei movimenti di quell'utente (intero ≥ 0).
- **`puoGirare(saldo)`** → `saldo >= ECONOMIA.COSTO_GIRO`.
- **`giriEleggibile(movimenti, userId, now)`** → `{ ok, prossimoSblocco }` per il **gratis
  settimanale**: guarda il movimento `motivo==='settimanale'` più recente dell'utente;
  `ok = now − ultimo ≥ GRATIS_OGNI_GIORNI giorni` (o nessun movimento). `prossimoSblocco` =
  data del prossimo gratis. (È la funzione un tempo chiamata `ruotaEleggibile`, ora sui movimenti.)
- **`fetteRuota({ haSegreti, haCarte, haProposte, haBuoni })`** → copia di `FETTE` con i
  pesi delle fette **condizionali** forzati a 0 quando la condizione manca: `segreto` → 0
  se `!haSegreti`; `tod` → 0 se `!haCarte`; `piccante` → 0 se `!haProposte`; `buono` → 0 se
  `!haBuoni` (liste editabili svuotate). Le fette restano nell'array per la geometria (8
  spicchi sempre).
- **`estraiFetta(fette, rnd = Math.random)`** → estrazione **pesata** (salta peso 0) →
  `{ indice, fetta }`. `indice` serve al modulo per calcolare l'angolo di atterraggio.
- **`ultimiPremi(movimenti, userId, n = ECONOMIA.ULTIMI_PREMI)`** → ultimi `n` movimenti
  `motivo==='giro'` dell'utente, ordinati per data desc, con la fetta risolta da `esito`.
- **Contenuti editabili (seeding + lettura):**
  - **`ruotaContenutiDefaultRows(coupleId)`** → righe piatte per il seeding dei default
    (categoria `'piccante'` da `PROPOSTE_PICCANTI_DEFAULT`, categoria `'buono'` da
    `BUONI_SORPRESA_DEFAULT`), con `ordine` = posizione. Stile `tipiDefaultRows`/`facceDefaultRows`.
  - **`proposteDa(contenuti)`** → righe `categoria==='piccante'` ordinate (`ordine`).
  - **`buoniSorpresaDa(contenuti)`** → righe `categoria==='buono'` ordinate.
  - **`pescaContenuto(lista, rnd = Math.random)`** → un elemento a caso (rnd iniettabile); `null` se vuota.

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
- **Contenuti editabili** (stile `listDadiFacce`/`seedDadiFacce`/`updateDadiFaccia`):
  - **`listRuotaContenuti(client, coupleId)`** → tutte le righe `ruota_contenuti` della coppia.
  - **`seedRuotaContenuti(client, rows)`** → insert dei default (solo prima apertura).
  - **`addRuotaContenuto(client, { couple_id, categoria, emoji, testo, descrizione, ordine })`**.
  - **`updateRuotaContenuto(client, id, patch)`** / **`deleteRuotaContenuto(client, id)`**.

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
3. **Contenuti editabili:** `listRuotaContenuti`; se vuoto → `seedRuotaContenuti(
   ruotaContenutiDefaultRows(couple_id))` e ricarica (come `giochi.js` con i Dadi). Tieni
   `proposte = proposteDa(cont)` e `buoni = buoniSorpresaDa(cont)` per la risoluzione.
4. Determina le condizioni: `haSegreti = segretiDaRivelare(buoni, me).length > 0` (richiede i
   `buoni`; vedi spec segreti), `haCarte = listCarte(...).length > 0`,
   `haProposte = proposte.length > 0`, `haBuoni = buoni.length > 0` →
   `fette = fetteRuota({ haSegreti, haCarte, haProposte, haBuoni })`.
5. Disegna: card saldo (pallini-gettone = saldo, "gratis tra Ng" = countdown da
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

### 7.5 Editor dei contenuti (proposte 🔥 + buoni a sorpresa 🎁)

L'utente modifica i contenuti **in qualsiasi momento**, riusando il **pattern dell'editor
Dadi** (`openSheet` con righe input, salvataggio per riga; vedi `giochi.js#openEditor`):

- **Apertura:** dal FAB quando il gioco selezionato è la Ruota. Poiché la tab Giochi ora ha
  più giochi, il FAB instrada all'editor del **gioco corrente** (Dadi → editor facce; Ruota
  → editor contenuti). Il modulo `giochi.js` tiene lo stato del gioco selezionato e smista
  `fab:giochi` di conseguenza.
- **Due sezioni nel foglio:** "🔥 Proposte piccanti" (lista di righe-testo) e "🎁 Buoni a
  sorpresa" (per riga: emoji + titolo + descrizione). Ogni sezione: righe esistenti
  modificabili, "＋ Aggiungi", e cestino per eliminare.
- **Salvataggio:** `addRuotaContenuto` / `updateRuotaContenuto` / `deleteRuotaContenuto`;
  validazione "testo non vuoto" (come l'editor Dadi). Alla chiusura, ridisegna la Ruota.
- **Vincolo minimo:** non si può svuotare del tutto una categoria usata da una fetta attiva
  (se resti con 0 proposte, la fetta 🔥 si comporta come le condizionali → peso 0, oppure si
  blocca il salvataggio con un avviso). **Decisione:** peso 0 + resa smorzata, coerente con
  segreto/ToD (nessun blocco fastidioso). Aggiornare `fetteRuota` per azzerare anche
  `piccante`/`buono` se la rispettiva lista è vuota.
- **Estetica:** riusa lo stile-sheet esistente (Dadi/Tipi) → **nessuna nuova scelta grafica**.
  Se in futuro si vorrà un editor dedicato più curato, si farà prima un mockup approvato.

---

## 8. Risoluzione dei premi

Il pop-up mostra sempre "Hai vinto" + emoji + label; il **bottone azione** e l'effetto
dipendono dalla fetta:

| fetta | tipo | cosa fa | dipendenze |
|---|---|---|---|
| 💋 `segreto` | flusso | bottone "**Scegli quale busta →**" → apre la scelta tra i segreti in attesa; alla scelta parte l'animazione-busta e la transizione `'rivela'` | spec **segreti** |
| 🔥 `piccante` | immediato | `pescaContenuto(proposte)` (lista editabile DB) → mostra la frase nel pop-up | `ruota_contenuti` |
| 🎁 `buono` | **differito** | `pescaContenuto(buoni)` (lista editabile DB) → materializza un **regalo** nei Buoni: `addBuono({ tipo:'regalo', stato:'attivo', a_id:me, da_id:partner, emoji, titolo, descrizione })`; pop-up "lo trovi nei Buoni" | `addBuono` + `ruota_contenuti` |
| 💌 `desiderio` | **differito** | pesca un desiderio `da_provare` a caso e lo **evidenzia** nei Desideri; pop-up "te l'abbiamo scelto noi" | tab Desideri |
| 🃏 `tod` | immediato | pesca una **carta** a caso (`pescaCarta`) e la mostra nel pop-up. **Fetta spenta** (peso 0) se il mazzo è vuoto → non vincibile finché non si aggiungono carte | `listCarte` + `pescaCarta` (carte esistono nel DB; modulo ToD non necessario) |
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
  alla vittoria. Oggi nessun gioco-con-vincitore è costruito; domani: **Strip Poker** e altri.
- **Scelta utente (2026-05-27):** quanti giri dà ciascun gioco — e se un gioco debba dare
  **giri o altri premi** (es. un buono, un giro extra) — resta **aperto**, da decidere quando
  il gioco esiste. Per ora `GIRI_PER_VITTORIA = 1` è solo un **default provvisorio**.
- Questo mantiene l'economia **aperta all'estensione**: l'hook `concediGiro` è il punto di
  innesto; se in futuro un gioco dovrà dare un premio diverso dai giri, si aggiunge un hook
  fratello senza toccare la ruota. Niente numeri decisi ora su giochi non costruiti.

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
- `fetteRuota`: peso 0 per le condizionali quando manca la condizione (segreto/carte/proposte/buoni),
  > 0 quando c'è; sempre 8 fette.
- `estraiFetta`: con `rnd` deterministico atterra sulla fetta attesa; **non** estrae mai una
  fetta a peso 0; copre l'intervallo.
- `ultimiPremi`: ordina per data desc, taglia a `n`, solo `motivo==='giro'`, solo dell'utente.
- **Contenuti:** `ruotaContenutiDefaultRows` produce le righe attese (categorie + ordine);
  `proposteDa`/`buoniSorpresaDa` filtrano e ordinano per categoria; `pescaContenuto` estrae
  con `rnd` deterministico e dà `null` su lista vuota.

**Store** con client Supabase **finto iniettato**: `accreditaGiro`/`spendiGiro`/`concediGiro`
fanno l'insert giusto (delta, motivo, esito); `listGiri` mappa le righe;
`add/update/delete/seedRuotaContenuti` fanno le query attese.

**Smoke Playwright** prima di "fatto": la Ruota gira, scala il saldo, mostra il pop-up dallo
spicchio con **emoji dritte**; si **blocca** a saldo 0; il gratis matura quando dovuto; un
premio differito (buono) **compare** nei Buoni; "apri segreto" appare **solo** con una busta
in attesa; **editor contenuti**: aggiungi/modifica/elimina una proposta e un buono → si
riflette al giro successivo (e la fetta si spegne se svuoti la categoria); storico "Ultimi
premi" si aggiorna; layout mobile corretto; persistenza dopo reload.

---

## 12. Domande aperte → CHIUSE il 2026-05-27

1. **Contenuti** proposte 🔥 (8 frasi) e buoni a sorpresa 🎁 (pool) → **bozza scritta,
   mostrata in mockup** (`mockups/ruota-contenuti.html`) e **approvata** dall'utente. I
   testi sono ora i **default di seeding** (§4) e diventano **editabili dall'app in qualsiasi
   momento** via `ruota_contenuti` + editor (§3.2, §7.5).
2. **Pesi delle fette** → **tutti uguali** (peso 1) per ora; si tara dopo l'uso dal vivo.
3. **Giri per vittoria** → **resta aperto di proposito**: dipende da giochi non costruiti e
   un gioco potrà dare giri *o altri premi*; `GIRI_PER_VITTORIA = 1` è solo default
   provvisorio, l'hook `concediGiro` è il punto d'innesto estensibile (vedi §9).
4. **Fetta 🃏 ToD a mazzo vuoto** → **fetta spenta** (peso 0), stesso meccanismo della fetta
   segreto: non vincibile finché il mazzo è vuoto (vedi §5 `fetteRuota`).

---

## 13. Fuori scope (YAGNI)

- Niente cron/scheduler: il gratis matura **pigro** all'apertura.
- Niente transazioni/lock server sul saldo (ledger insert-only + guardia UI bastano).
- Niente scambio/regalo di giri tra i due partner.
- Niente storico "movimenti" completo a UI (solo "Ultimi premi" = le vincite).
- Niente notifiche push/email.
