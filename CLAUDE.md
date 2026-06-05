# brace — istruzioni di progetto

## Direzione visiva — CONGELATA il 2026-06-05 (fonte di verità unica)

Decisa in sessione dedicata dopo l'audit multi-agente (vedi `docs/audit-2026-06-05-verdetto.md`).
Queste 4 scelte NON si riaprono: ogni nuovo CSS/markup le rispetta. Niente nuove esplorazioni
di palette/font/tono senza decisione esplicita dell'utente che revochi questa sezione.

1. **Ember (accento azione): `#ff6f3c`** — quello di home.css/mockup home-C-fusione.
   L'ember si usa SOLO dove si agisce o c'è novità (bottoni primari, badge, kicker, puntino brand).
   L'oro `#ffb454` è struttura/cornice, mai azione. Il valore `#e0683a` di styles.css è deprecato:
   nei blocchi nuovi non si usa; nei vecchi si sostituisce quando li si tocca naturalmente.

2. **Font: 2 famiglie + 2 ancillari.**
   - Display (titoli, brand, saluti): **Fraunces** (wght 500–700).
   - Corpo/UI (testo, bottoni, label, input): **Nunito**.
   - DEPRECATI per sempre: Arial, Georgia/Times, Playfair, Impact, Comic Sans, Segoe Script.
     Nei blocchi nuovi non compaiono mai; nei vecchi si potano quando li si tocca.

3. **JetBrains Mono: CONFINATO. Caveat: RESTA.**
   - Mono SOLO per numeri, date/orari, gradi del calore e kicker/meta delle card.
     MAI per bottoni, nomi, label di UI, testi.
   - Caveat SOLO per le citazioni "a mano" del partner dentro le card (la voce di lei).
     MAI per UI, titoli o testi propri dell'app.

4. **Tono del copy: UMANO (de-terminalizzato).**
   - Vietata la retorica da shell: niente `$ comando --flag`, `~/percorsi`, `> output`, snake_case visibile.
   - Si scrive per la coppia: "Ultimi sussurri", "Lei ha lasciato una fantasia", "Tutto tranquillo, stanotte".
   - I valori (orari, numeri) restano in mono; le parole no.

## Regole di sessione (dall'audit 2026-06-05)

- Definition-of-done = **commit + suite verde** (`node --test`), non "mi piace come sembra".
- Niente nuovi mockup della home finché `feedEventi` non è verde su device.
- Roadmap di riferimento: `docs/audit-2026-06-05-verdetto.md` (10 passi).
