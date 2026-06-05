# Direzione visiva di brace — decisione congelata (2026-06-05)

## Contesto

L'audit multi-agente del 2026-06-05 (`docs/audit-2026-06-05-verdetto.md`) ha identificato come
blocker il conflitto tra TRE palette coesistenti:

| Sorgente | Ember | Font |
|---|---|---|
| `styles.css` (sezioni live) | `#e0683a` | Georgia/Times + Arial |
| `home.css` + `mockups/home-C-fusione.html` (home live + mockup approvato) | `#ff6f3c` | Fraunces, Nunito, JetBrains Mono (esteso), Caveat |
| Proposta sintesi audit | `#ff6a39` | (niente mono) |

Finché coesistevano, ogni lavoro su token o port della home ereditava il conflitto.
Questa sessione (visual companion, varianti fianco a fianco, ~30 min) ha chiuso le 4 decisioni.

## Le 4 decisioni

### 1. Ember unico: `#ff6f3c`

Scelto tra `#e0683a` (sommesso), `#ff6f3c` (vivo, già in home.css live) e `#ff6a39` (quasi identico a B).
Motivazione: alto contrasto sul velluto scuro, ed è già in produzione nella home definitiva →
zero lavoro di riallineamento sul port de La Posta.

Regola d'uso: ember = SOLO azione/novità (bottoni primari, badge, kicker, puntino brand).
Oro `#ffb454` = struttura. `#e0683a` deprecato (sostituzione incrementale, mai campagna unica).

### 2. Font: Fraunces (display) + Nunito (corpo)

Scelta tra Fraunces+Nunito (mockup/home live), Lora+Inter (sobria), Cormorant Garamond+Nunito (romantica ma fragile).
Motivazione: carattere caldo senza fragilità sui pesi piccoli; già in produzione nella home.

Eliminati per sempre: Arial (115 usi), Georgia (59), Playfair (7), Impact (4), Comic Sans (3), Segoe Script (3).
Potatura incrementale: i blocchi nuovi non li usano mai; i vecchi si puliscono quando toccati.

### 3. JetBrains Mono confinato; Caveat resta

Scelta mono tra: confinato / ovunque (com'era nel mockup, 27 usi) / zero.
- **Mono confinato** a numeri, date/orari, gradi, kicker/meta delle card. Mai su bottoni, nomi, label, testi.
- **Caveat resta** esclusivamente per le citazioni "a mano" del partner nelle card (cuore emotivo). Mai per UI.

Conseguenza sul mockup approvato: nel port de La Posta, bottoni (`.enter`, `.skip`), nomi coppia (`.nm`),
label di UI passano da mono a Nunito. Kicker/meta/heat restano mono.

### 4. Tono del copy: umano

Scelto tra terminale (com'era: `$ notifiche --tail 3`, `~/la_nostra_stanza`, `> tutto tranquillo`) e umano.
- Vietata la sintassi da shell e lo snake_case visibile.
- Copy di riferimento: "Ultimi sussurri", "Lei ha lasciato una fantasia", "Tutto tranquillo, stanotte. La brace cova."
- Stima: ~10 stringhe da riscrivere nella home, da fare dentro il port (non lavoro extra).

## Cosa NON è stato deciso qui (fuori scope)

- I 6 template di card con dati reali (passo 4 della roadmap).
- La struttura di tokens.css e la strategia di ereditarietà (passo 5).
- Nomi canonici delle sezioni e disambiguazioni IA (passo 8).

## Attuazione

- La sezione "Direzione visiva — CONGELATA" in `CLAUDE.md` è la fonte di verità operativa.
- Mentalità greenfield: i blocchi NUOVI nascono già conformi; i vecchi si adeguano quando toccati.
  NIENTE search-and-replace di massa dei 384 hex a parità pixel.
- Prossimo passo di roadmap: merge+applicazione `onboarding.sql`, poi `feedEventi`+test (passi 2-3 dell'audit).

## Artefatti della sessione

Mockup di confronto in `.superpowers/brainstorm/42669-1780646936/content/`
(ember.html, fonts.html, mono-caveat.html, tono-copy.html) — non versionati (.gitignore).
