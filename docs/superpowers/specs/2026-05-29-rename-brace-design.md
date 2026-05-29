# Rename app → **brace.** — design

**Data:** 2026-05-29
**Progetto:** ex *Velluto* → *Lussuria* → ora **brace.** (app di coppia, mobile-first, frontend statico + Supabase, solo 🐻 + 🧁).

## Perché

"Lussuria" è troppo generico, esiste già, e visivamente non convince. Serviva un nome originale, sul registro sensuale/osé ma non volgare, e soprattutto **bello da vedere** come wordmark.

## Decisione

**Nome:** `brace` (la brace — il fuoco vivo sotto la cenere). Calore che resta e si riaccende: sensuale senza essere esplicito, parola italiana vera ma non scontata, suono morbido.

**Wordmark:** scelto via mockup interattivo (`brace-lockup.html`, variante **D**):

- Tutto **minuscolo**: `brace.`
- Font serif display: **Playfair Display**, peso ~500
- **Punto finale color brace/ember** (arancio caldo, es. `#e0683a`) — unico accento di colore
- Registro: soft, contemporaneo, elegante

Si lega all'estetica già esistente (velluto/seta scuri, motivo keyhole, oro caldo).

## Ambito del rename (cosa toccare in implementazione)

Testi/branding visibili:
- `index.html` — `<title>`, `apple-mobile-web-app-title`, `.login-title`, `.lock-title`, `.brand`
- `manifest.json` — `name`, `short_name`
- Testi UI eventuali ("Esci da Lussuria", footer Impostazioni)
- File di test/doc che citano il vecchio nome (`test/smoke-android.html`, `test/smoke.md`, vecchia spec)

Tecnico — **da NON rinominare a freddo** (rischio di orfanare stato salvato sui device già in uso):
- **Chiavi localStorage** `lussuria.*` (es. `lussuria.lock`, saldo slot, smoke) → mantenere il prefisso esistente **oppure** prevedere migrazione one-shot che copia i valori vecchi sul nuovo prefisso. Decisione rimandata al piano.
- `sw.js` cache name `lussuria-v23` → al rename va **bumpato** (es. `brace-v24`) per invalidare la cache; la stringa interna è libera di cambiare senza rischi utente.

## Fuori ambito

- Nuova icona/logo grafico (oltre al wordmark testuale) — eventuale passo separato.
- Redesign della topbar o di altre schermate.

## Aperto / da decidere nel piano

- Strategia chiavi localStorage: mantenere prefisso `lussuria.*` vs migrazione a `brace.*`.
- Se serve un dominio/repo rename (oggi `xbacco.github.io/velluto/`).
