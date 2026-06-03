# Home "fusione · La Posta" — design

**Data:** 2026-06-03
**App:** brace. — app di coppia, 2 persone (🐻 Tomas + 🧁 lei)
**Sorgente visiva approvata:** `mockups/home-C-fusione.html` (decisione audit 21-agenti)
**Stato:** ✅ approvato — pronto per il piano di implementazione.

## Contesto

L'audit multi-agente ha diagnosticato lo stallo come problema di **home/IA/grafica**, non
di codice (255 test verdi). La rotta scelta è la **fusione "La Posta"**: tiene il rito della
porta (firma di brace) ma lo riduce a un ingresso una-tantum, e dentro mostra subito
**cosa ti ha lasciato il partner** — un feed di eventi reali — con un dock in basso per
raggiungere ogni sezione in un tocco.

Questa fusione **supera** sia la home porta→camera→hub a 7 porte attualmente live
(`2026-06-01-home-definitiva-port-design.md`) sia l'esplorazione "posta di lei / D2 biglietti"
abbandonata (`2026-06-03-home-posta-design.md`). Da quest'ultima si **riusano i blocchi
logici** (feed eventi + `home_visto_at`), non il layout.

Il punto di prodotto del verdetto — *"aprendo l'app, in <1s vedo cosa mi ha lasciato lei"* —
è il criterio di successo.

## Decisioni bloccate (brainstorming 2026-06-03)

1. **Target = fusione "La Posta"**, sostituisce la home porta→camera→hub live.
2. **Dock a 5 voci:** fantasie (desideri), giochi, esperienze (calendario), mappa, buoni.
   La **galleria è de-promossa dal dock** ma resta una tab del pager (raggiungibile via
   swipe) e le **card-foto del feed** ci portano dritto (`goto galleria`). Nessuna chirurgia
   sui moduli galleria/esperienze.
3. **Traguardi fuori dal dock** (era un placeholder "presto"; tornerà come feature vera).
4. **Stato quieto minimale** come il mockup (calore che respira + copy anti-vuoto).
   Niente `semiInvito` generato in v1.
5. **Scorte non come striscia separata:** i giri sono una card del feed; lo slot confluisce
   nel contatore dock di "giochi". Nessun `statoScorte` dedicato.
6. **"Nuovo" sincronizzato via DB:** nuova colonna `profiles.home_visto_at`.

## Architettura — da 3 stati a 2

```
PRIMA:  #home (porta) ─▶ #camera (hub 7 porte) ─▶ #app (pager)   [porta ogni volta]
DOPO:   #home (porta-soglia overlay 1×/giorno, saltabile  +  hub-feed sotto)
        #app  (pager sezioni — INVARIATO)
```

- La porta diventa un **overlay** (`.door`) dentro `#home`: appare una volta al giorno,
  si chiude su *entra*/*salta* e rivela l'hub-feed sotto. Lo stato `#camera` **sparisce**.
- `gohub` (il `⌂` dalle sezioni) torna a `#home` (l'hub-feed) e ri-renderizza la home
  (per aggiornare feed/visto), invece di riaprire `#camera`.
- `goto` / `enterSection` (il pager esistente) **non cambiano**.
- Un solo stato visibile alla volta (`display:none`/`hidden` sugli altri).

## Componenti

### Migrazione SQL
```sql
alter table profiles add column if not exists home_visto_at timestamptz;
```
Da aggiungere alla sede delle migrazioni esistenti (es. `supabase/presence.sql` o un nuovo
`supabase/home.sql`, da decidere in fase di piano). Nessun'altra modifica di schema.
`home_visto_at` è scrivibile dal proprietario del profilo: aggiungere la colonna al
`grant update (...)` per `authenticated` (oggi: `display_name, avatar, last_seen`).

### `js/store.js` — persistenza "visto"
```
getHomeVistoAt(client, meId) -> string|null   // profiles.home_visto_at
setHomeVistoAt(client, meId, iso) -> void
```
Pattern `check()` esistente (nessun fallimento silenzioso). Se la **lettura** fallisce, la
home degrada trattando tutto come "non nuovo" (niente falsi pallini). Se la **scrittura**
fallisce, log in console: al massimo i pallini non si azzerano, non è critico.

### `js/lib/logic.js` — funzioni pure (con test)
```
feedEventi(liste, me, vistoAt, now = new Date()) -> Evento[]
  Evento = { tipo, emoji, sezioneKey, kicker, titolo, hand?, pill?,
             autoreId, daLei, quandoISO, nuovo, refId }
  - fonde le sorgenti Tipo A (tabella sotto), filtra autore ≠ me dove indicato
  - aggiunge la card sintetica "giri" se saldoGiri(giri, me) > 0 (daLei=false)
  - nuovo = quandoISO > vistoAt   (vistoAt null ⇒ true)
  - ordina: nuovi prima, poi per quandoISO desc
  - testo da template per tipo

contaNuovi(feed) -> number     // conta gli Evento con (nuovo === true && daLei === true)
```

Il **dock** riusa la funzione esistente `riepilogoSezioni(liste, me, now)` → `{ key, count,
novita, teaser }` per le 5 voci (count = contatore, novita = LED hot/warn/none). Lo slot è
già incluso nel count di "giochi" (`saldoGiri + saldoSlot`).

`feedEventi` **non** tocca il calore (`calcolaCalore` invariato).

#### Sorgenti del feed (Tipo A)
| Card | Filtro | Emoji | `sezioneKey` |
|---|---|---|---|
| fantasia | `desideri`: autore_id ≠ me ∧ stato='da_provare' | 🔥 | `desideri` |
| polaroid | `foto/galleria`: autore_id ≠ me | 🖼️ | `galleria` |
| esperienza | `esperienze`: autore_id ≠ me | 📅 | `calendario` |
| luogo | `luoghi`: autore_id ≠ me | 🗺️ | `mappa` |
| buono | `buoni`: a_id = me ∧ stato='attivo' (pill scadenza) | 🎟️ | `buoni` |
| brace di stasera | `saldoGiri(giri, me) > 0` (non da lei) | 🎲 | `giochi` |

`nuovo = creato > home_visto_at`. La card "giri" è un contatore persistente: non concorre a
`contaNuovi` (`daLei=false`) e resta visibile anche nello stato quieto.

### `js/modules/home.js` — riscrittura di `renderHome`
**Rimuovo** la macchina camera-hub: `showCamera`, `paintHero`, `selectSlot`, `resetHub`,
`buildNotifLog` (log terminale), `apriTraguardi`, e gli embers/dolly della camera; aggiorno
`wireOnce` di conseguenza.

**Tengo** (riuso invariato): calore (`caricaItemsCalore`, `renderHeatGauge`, `renderHeatPop`,
`aggiornaCalore`), presenza (`aggiornaPresenza` + heartbeat `presence.js`), `renderAttesaPartner`
(banner partner non ancora unito), `dispatch`, `reduceMotion`.

**Nuovo:**
- `renderFeed(feed)` — costruisce le `.fcard` (compose in cima + card per tipo); le `nuovo`
  hanno il sigillo, la più fresca è in evidenza; tap → `goto sezioneKey`.
- `renderQuiet(r)` — stato quieto minimale (brace che respira + copy con il calore).
- `buildDock(riepilogo)` — 5 slot con contatore + LED; tap → `goto key`.
- `mostraPorta(contaNuovi)` — overlay porta 1×/giorno (vedi sotto).
- `intestazione(contaNuovi, vistoAt)` — saluto + "dall'ultima volta · …".

#### Porta una-volta-al-giorno
Flag per-dispositivo in `localStorage`: chiave `brace_soglia_<YYYY-MM-DD>`. A `renderHome`,
se la chiave di oggi è assente → mostro l'overlay porta con anteprima `» 🧁 ti ha lasciato N
cose` (N = `contaNuovi`); su *entra*/*salta* → setto la chiave e nascondo l'overlay (dolly,
o istantaneo se `reduceMotion`). La porta è indipendente dal **PIN lock** esistente: viene
dopo l'eventuale sblocco, quindi l'anteprima non espone contenuti prima del PIN.

### `index.html`
Sostituire il blocco `#home` con la struttura della fusione e **rimuovere** `#camera`:
- `.door` overlay (#door): skip, peeknote, doorway disegnata, CTA "entra".
- `.hub`: topbar (brand `brace.` + chip coppia con presenza), `.heat` (gauge cliccabile),
  `.scroll` (`#feed` + `#quiet`), `.dock` (`#rail`).
- `#homeHeatPop` (pop-up calore) allineato alla `.heatPop` del mockup.
- Il pager (`#app`/`#viewport`/`#track`/`#nav`) resta **intatto**.

### `js/app.js`
- Evento `gohub`: nasconde `#app`, mostra `#home`, ri-renderizza la home. (Prima riapriva
  `#camera`.)
- `goto`/`enterSection`: invariati. `TABS` resta a 6 (galleria inclusa, raggiungibile via
  swipe e via card-foto del feed).

### `home.css`
Portare gli stili della fusione dal mockup (palette già scoped a `#homeRoot`, coerente col
mockup: `--ember:#ff6f3c`, `--gold:#ffb454`, …). **Rimuovere** gli stili della camera-hub
ora obsoleti (`.camera`, `.stage`, `.hero`, `.statusbar`, dock-hub a porte, ecc.).
Vincolo noto: niente `calc()` dentro gli angoli dei `conic-gradient` (WebView Android).

### `sw.js`
Bump versione cache (forza pulizia delle vecchie) + aggiornare la lista asset se cambia.

## Data flow — `renderHome({ client, me })`
1. Fetch liste in parallelo (store.js) + profili coppia + `home_visto_at` (best-effort).
2. `vistoAt` = valore salvato, **catturato prima** di sovrascriverlo.
3. `feed = feedEventi(liste, me, vistoAt)`; `n = contaNuovi(feed)`.
4. Intestazione (saluto in base a `n`) + feed (pieno) **oppure** quiet (`n === 0`).
5. Dock da `riepilogoSezioni` (contatori + LED).
6. Calore (gauge + popup) e presenza partner: invariati.
7. Porta 1×/giorno con anteprima `n` (se dovuta).
8. **All'uscita** dalla home (handler `goto`, prima di `enterSection`): `setHomeVistoAt(now)`.

## I tre stati (il "sempre viva")
- **Pieno** (`contaNuovi > 0`): saluto "🧁 ti ha lasciato qualcosa"; card col sigillo, la più
  fresca in evidenza; compose in cima.
- **Quieto** (`contaNuovi === 0`): minimale — brace che respira + "Tutto tranquillo… il fondo
  non si spegne (X°)". Le card già lette restano "posate". Mai schermata vuota.
- **Sola** (partner offline / non unito): copy/presenza più bassi; se non ancora unito →
  banner attesa esistente. Calore, feed e dock restano attivi.

## Edge / robustezza
- `home_visto_at` illeggibile → tutto "non nuovo" (niente falsi pallini).
- `vistoAt` null (primo accesso) → tutto nuovo; porta mostrata.
- Sorgente del fetch in errore → log e degrado di quella parte (best-effort, come oggi).
- `prefers-reduced-motion` → niente dolly/animazioni porta.
- Flag soglia ripulito → porta riappare (accettabile).

## Sequenza di build (incrementale, ogni step verificabile)
1. **Migrazione** `home_visto_at` + grant; **store** `getHomeVistoAt`/`setHomeVistoAt`.
2. **`feedEventi` + `contaNuovi`** in logic.js + **test** (filtro autore, flag nuovo vs
   vistoAt, card giri, ordinamento). Suite verde.
3. **Port HTML/CSS** della fusione (statico, senza dati): parità visiva col mockup; rimozione
   markup/stili camera-hub.
4. **Cablaggio dati** in `renderHome` (feed, quiet, dock, calore, presenza).
5. **Cablaggio navigazione** (dock→`goto`; card feed→`goto`; `gohub`→home; porta 1×/giorno;
   `setHomeVistoAt` all'uscita).
6. **Bump SW** + pulizia finale (asset camera non più usati).
7. **Verifica su device** (login Supabase richiesto).

## Testing
- **Logica pura** (`node --test`): `feedEventi`, `contaNuovi` (nuovi). `riepilogoSezioni`,
  calore, presence già coperti. Mantenere la suite verde (oggi 255).
- **Manuale su device:** porta 1×/giorno; stato pieno/quieto/sola; azzeramento pallini al
  rientro dopo navigazione; contatori/LED del dock; galleria raggiungibile via swipe e card.

## Fuori scope (v1 — YAGNI)
- `semiInvito` ricco nello stato quieto.
- Striscia "scorte" dedicata; card slot a sé.
- Quick-add inline nel compose (resta routing a desideri-nuovo).
- Traguardi reali; notifiche push; ricalibrazione pesi calore.
- Ridisegno delle sezioni interne (restano com'è).
