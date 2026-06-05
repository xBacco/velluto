# La Posta — template card + stato quieto (passo 4) — design

**Data:** 2026-06-05
**Roadmap:** passo 4 di `docs/audit-2026-06-05-verdetto.md`
**A monte:** `2026-06-03-home-fusione-posta-design.md` (architettura della home),
`feedEventi`/`contaNuovi` già verdi (commit c895716).
**Vincoli:** direzione visiva CONGELATA in `CLAUDE.md` (ember azione, oro struttura,
Fraunces/Nunito, mono confinato ai valori, Caveat solo voce di lei, copy umano).
**Stato:** ✅ approvato dall'utente (brainstorming con visual companion, 2026-06-05).

## Cosa si costruisce

I **6 template HTML delle card** del feed della home + il **blocco quiet**, come modulo
condiviso testabile con `node --test`, più una **pagina di validazione** con dati Supabase
veri. Niente cablaggio nella home vera (è il passo successivo della fusione).

## Decisioni del brainstorming (companion, 2026-06-05)

1. **Composizione feed:** compatta — riga unica per card, pallino sul nuovo.
2. **Anatomia card:** **biglietto** — card morbida raggio 11px, gradiente burgundy→card,
   barra accent laterale + pallino solo sul nuovo.
3. **Quiet-state:** **brace + cose vive** — brace che respira + sotto SOLO le card
   azionabili (giri, buoni attivi). Niente card già lette nel quieto.
4. **Copy letterale:** la voce in maiuscolo (kicker) nomina l'evento per quello che è.
   Niente metafore ("una pagina nel diario" scartata). I kicker restano quelli già in
   `feedEventi`.
5. **Polaroid senza didascalia:** **nessuna riga** al posto del titolo (card più snella).
   Con didascalia: è voce di lei → si renderizza in **Caveat** (campo `hand`).
6. **La posta letta si ritira:** la home mostra solo **nuovo + azionabile**. La card letta
   sparisce dalla home al rientro; il contenuto vive nella sua sezione (la sezione È la
   cronologia). **Lo stato "posata" non esiste più.**
7. **Buono con meta:** la card buono guadagna la riga `chi · quando` come le altre card
   di lei (può restare giorni sulla home: il "quando" serve).

## Il modello del feed

```
visibili = feed.filter(e => e.nuovo || e.tipo === 'buono' || e.tipo === 'giri')
contaNuovi(feed) > 0  → feed pieno   (card nuove + azionabili)
contaNuovi(feed) === 0 → quiet       (blocco brace + azionabili sotto)
```

Le card azionabili (buono attivo, giri) restano sempre; perdono barra/pallino quando non
sono più nuove. Tutte le altre spariscono una volta lette.

## I 6 template — copy e campi

Anatomia comune (biglietto): `emoji | kicker / contenuto / meta | pallino se nuova`.
Accent per tipo; barra laterale + pallino **solo su `nuovo`**, colorati con l'accent.

| Tipo | Accent | Kicker (mono, maiuscolo) | Contenuto | Meta |
|---|---|---|---|---|
| 🔥 fantasia | ember | `una fantasia nuova` | `hand` (testo di lei, Caveat) | `chi · quando` |
| 🖼️ polaroid | ember | `una polaroid` | `hand` (didascalia, Caveat) o **niente** | `chi · quando` |
| 📅 esperienza | ember | `una nuova esperienza` | `titolo` (Fraunces) | `chi · quando` |
| 🗺️ luogo | ember | `ha segnato un posto` | `titolo` (nome) + `hand` (descrizione) se c'è | `chi · quando` |
| 🎟️ buono | oro | `un buono per te` / `un buono sta per scadere` | `titolo` + pill `⏳ <scadenza> · riscuoti` | `chi · quando` |
| 🎲 giri | rosa | `la brace di stasera` | `titolo` ("Hai N giri da spendere") + pill `gira la ruota →` | — |

- Il campo `hand` si renderizza sempre **tra virgolette “…”** (è una citazione di lei).
- Meta in mono: `🧁 lei · 2h` — autore + tempo relativo. Solo su card `daLei`.
- Pill in mono (valori/azioni brevi); kicker in mono maiuscolo: confini del mono rispettati
  (mai Nunito/Fraunces sostituiti da mono per testi).
- Font: titoli Fraunces, UI Nunito, citazioni Caveat — nessun'altra famiglia.

### Tempo relativo (`tempoRelativo(iso, now)`)
`<60s` → `ora` · `<60min` → `Xm` · `<24h` → `Xh` · ieri (giorno di calendario) → `ieri`
· altrimenti → `X gg fa`. Valore in mono dentro la meta.

## Lo stato quieto (`quietHTML`)

```
🔥 (cerchio brace, animazione breathe — CSS)
Tutto tranquillo, per ora.        ← Fraunces 600
La brace tiene 72°. Nessuna nuova traccia — ma il fondo non si spegne.
                                   ← Nunito; SOLO "72°" in mono oro
```

- Titolo **"Tutto tranquillo, per ora."** — neutro rispetto all'ora del giorno
  (lo "stanotte" delle visioni sarebbe falso di mattina; principio del copy letterale).
- `gradi` assente/null → frase ridotta: `Nessuna nuova traccia — ma il fondo non si spegne.`
- Sotto il blocco quiet la pagina/home renderizza le card azionabili (stesse `cardHTML`).

## Architettura

### `js/modules/posta-card.js` (nuovo — il deliverable principale)
Modulo **puro, zero DOM, zero import dall'app**: funzioni che ritornano stringhe HTML,
eseguibili in `node --test`.

```
esc(s) -> string                 // escape HTML centralizzato (&, <, >, ", ')
tempoRelativo(iso, now) -> string
cardHTML(evento, ctx) -> string  // ctx = { autoreLabel: '🧁 lei', now: Date }
quietHTML({ gradi }) -> string
```

- `cardHTML` consuma l'`Evento` di `feedEventi` così com'è (tipo, emoji, kicker, titolo,
  hand?, pill?, daLei, nuovo, quandoISO). Tipo ignoto → ritorna `''` (e `console.warn`
  lato chiamante, non nel modulo).
- **Tutte** le stringhe dinamiche passano da `esc()`: testo fantasia, didascalia, titoli,
  nomi, `autoreLabel`. I template sono l'unico punto che produce markup delle card.
- Classi CSS prodotte: `fc`, `fc nuova`, accent via `style="--accent:var(--…)"` come nei
  mockup approvati.

### CSS — in `home.css`, scoped `.posta`
Stili card+quiet (biglietto, kicker, hand, meta, pill, barra nuova, blocco quiet, breathe)
aggiunti a `home.css` sotto il namespace `.posta` — additivi, non toccano gli stili live;
il port della home (passo successivo della fusione) li riusa tali e quali. Token dal
mockup `home-C-fusione.html`. Vincolo WebView: niente `calc()` negli angoli dei
`conic-gradient`.

### `mockups/valida-posta.html` (pagina di validazione)
Pagina sottile: login Supabase reale (come gli smoke esistenti) → fetch liste via
`js/store.js` → `feedEventi` → filtro visibili → render con `posta-card.js` dentro un
contenitore `.posta`. Toggle demo `pieno/quieto` per forzare la vista quiet anche con
posta nuova. **Scope: solo card + quiet** — niente dock, porta, calore, compose.

### `supabase/seed-posta.sql`
Seed con gli eventi di prova ad autore = account **seconda2**: 1 fantasia, 1 esperienza,
1 luogo (con descrizione), 1 buono con scadenza, giri per la card 🎲. **I testi li detta
l'utente** prima dell'esecuzione (il DB è vuoto post-truncate). La **polaroid si carica
via app** (serve lo storage), non via seed.

## Modifiche a `js/lib/logic.js` (piccole)

1. **Polaroid:** `didascalia` → campo `hand` (oggi finisce in `titolo`); senza didascalia
   nessun fallback. Aggiornare i test esistenti in `test/feed.test.js`.
2. **`feedVisibile(feed)`** (nuova, pura): `feed.filter(e => e.nuovo || e.tipo === 'buono'
   || e.tipo === 'giri')` — con test.
3. Nient'altro: kicker invariati (decisione 4 del brainstorming), il buono ha già
   `autoreId`/`quandoISO` per la meta.

## Testing (`test/posta-card.test.js`, nuovo)

- Per ogni tipo: kicker giusto, classe `nuova` solo se `nuovo`, contenuti al posto giusto.
- Polaroid: con didascalia → riga `hand` con virgolette; senza → **nessuna** riga contenuto.
- Buono: pill scadenza + meta `chi · quando`; giri: niente meta.
- XSS: `<script>` in testo/didascalia/titolo/nome esce escapato.
- `tempoRelativo`: tutti i bucket (ora/Xm/Xh/ieri/X gg fa).
- `quietHTML`: con gradi (il valore appare, in mono) e senza (frase ridotta).
- `feedVisibile` + aggiornamento test polaroid in `feed.test.js`.
- Suite intera verde (`node --test`), nessuna regressione sui 276 attuali.

## Edge / robustezza

- Evento di tipo ignoto → `cardHTML` ritorna `''` (il feed non si rompe).
- `quandoISO` null (card giri) → nessuna meta.
- `hand`/`titolo` vuoti → la riga non si renderizza (mai righe morte).
- `gradi` null → quiet senza valore.
- Testi lunghi → ellipsis via CSS (`white-space:nowrap`), il template non tronca.

## Definition of done (regole di sessione)

Commit + suite verde, **poi** validazione su device via `valida-posta.html` con il seed
reale. Niente nuovi mockup della home.

## Fuori scope (YAGNI)

- Cablaggio nella home vera (`renderHome`, dock, porta, compose, calore): passi successivi.
- Stato "posata" (non esiste più), cronologie nuove (le sezioni bastano).
- Notifiche, semiInvito, quick-add.
