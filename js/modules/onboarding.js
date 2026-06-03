import { mk, add, clear, toast } from '../ui.js';
import { createCouple, joinCouple } from '../store.js';

const EMOJI = [
  '🐻','🧁','🦊','🦋','🐰','🐱','🐺','🦌','🦁','🐯','🐶','🐼','🐨','🦄','🐙','🦉',
  '🌹','🌸','🍑','🍒','🍓','🍫','🍯','🥃','🍷','🍸','☕','🌙','⭐','✨','💫','🔥',
  '❤️','💋','💎','🎲','🎭','🕯️','🐝','🦢',
];

// Primo grafema (emoji intera, incluse le sequenze ZWJ come 👨‍👩‍👧). Intl.Segmenter dove
// disponibile, altrimenti fallback su spread (può spezzare le emoji composte).
function primoGrafema(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const s of new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(str)) return s.segment;
    return '';
  }
  return [...str][0] || '';
}

// Campo nome + selettore avatar emoji. Ritorna { wrap, getNome, getAvatar }.
function profiloFields(avatarIniziale = '❤️') {
  const wrap = mk('div', 'ob-fields');
  const av = mk('button', 'ob-avatar', avatarIniziale); av.type = 'button';
  const picker = mk('div', 'ob-picker');
  EMOJI.forEach(e => {
    const b = mk('button', null, e); b.type = 'button';
    b.onclick = () => { av.textContent = e; picker.classList.remove('show'); };
    add(picker, b);
  });
  // Cella "emoji libera": apre la tastiera del telefono e prende l'emoji digitata.
  const custom = mk('input', 'ob-emoji-custom'); custom.type = 'text'; custom.maxLength = 8;
  custom.placeholder = '➕'; custom.setAttribute('aria-label', 'Emoji a tua scelta');
  custom.oninput = () => {
    const g = primoGrafema(custom.value.trim());
    if (g) av.textContent = g;
  };
  add(picker, custom);
  av.onclick = () => picker.classList.toggle('show');
  const nome = mk('input', 'ob-fld'); nome.placeholder = 'Il tuo nome'; nome.maxLength = 40;
  add(wrap, av, picker, nome);
  return { wrap, getNome: () => nome.value.trim(), getAvatar: () => av.textContent };
}

function showCodice(root, codice, onDone) {
  clear(root);
  const card = mk('div', 'ob-card');
  add(card, mk('div', 'ob-kick', 'La vostra coppia è pronta'));
  add(card, mk('div', 'ob-codice', codice));
  add(card, mk('div', 'ob-sub', 'Condividi questo codice col tuo partner: gli serve per unirsi.'));
  const azioni = mk('div', 'ob-azioni');
  const share = mk('button', 'btn', 'Condividi');
  share.onclick = async () => {
    const testo = `Unisciti alla nostra coppia su brace. — codice: ${codice}`;
    try {
      if (navigator.share) await navigator.share({ text: testo });
      else { await navigator.clipboard.writeText(codice); toast('Codice copiato', 'ok'); }
    } catch (_) { /* utente ha annullato lo share: nessun errore */ }
  };
  const copia = mk('button', 'btn ghost', 'Copia');
  copia.onclick = async () => {
    try { await navigator.clipboard.writeText(codice); toast('Codice copiato', 'ok'); }
    catch (_) { toast('Copia non riuscita', 'err'); }
  };
  add(azioni, share, copia);
  add(card, azioni);
  const entra = mk('button', 'ob-entra', 'Entra nell\'app');
  entra.onclick = () => onDone();
  add(card, entra);
  add(root, card);
}

// Schermata onboarding. `onDone` viene chiamata quando il profilo è stato creato
// (entra/rientra nell'app via app.js).
export function renderOnboarding({ client, root, onDone }) {
  clear(root);
  root.style.display = '';

  // STATO scelta
  const scelta = mk('div', 'ob-card');
  add(scelta, mk('div', 'ob-candle', '🕯️'));
  add(scelta, mk('div', 'ob-kick', 'Benvenuti'));
  add(scelta, mk('div', 'ob-title', 'brace.'));
  const bCrea = mk('button', 'btn', 'Create la vostra coppia');
  const bUni = mk('button', 'btn ghost', 'Ho un codice');
  add(scelta, bCrea, bUni);

  const renderScelta = () => { clear(root); add(root, scelta); };

  // STATO crea
  bCrea.onclick = () => {
    clear(root);
    const card = mk('div', 'ob-card');
    add(card, mk('div', 'ob-kick', 'Crea la coppia'));
    const f = profiloFields();
    add(card, f.wrap);
    const err = mk('div', 'login-err');
    const ok = mk('button', 'btn', 'Crea e ottieni il codice');
    ok.onclick = async () => {
      err.textContent = '';
      if (!f.getNome()) { err.textContent = 'Scrivi il tuo nome.'; return; }
      ok.disabled = true;
      try {
        const codice = await createCouple(client, { nome: f.getNome(), avatar: f.getAvatar() });
        showCodice(root, codice, onDone);
      } catch (e) { err.textContent = e.message; ok.disabled = false; }
    };
    const back = mk('button', 'ob-back', '← Indietro'); back.onclick = renderScelta;
    add(card, ok, err, back);
    add(root, card);
  };

  // STATO unisci
  bUni.onclick = () => {
    clear(root);
    const card = mk('div', 'ob-card');
    add(card, mk('div', 'ob-kick', 'Unisciti con un codice'));
    const cod = mk('input', 'ob-fld codice'); cod.placeholder = 'Codice (6 caratteri)'; cod.maxLength = 6;
    cod.autocapitalize = 'characters';
    const f = profiloFields();
    add(card, cod, f.wrap);
    const err = mk('div', 'login-err');
    const ok = mk('button', 'btn', 'Unisciti');
    ok.onclick = async () => {
      err.textContent = '';
      if (!cod.value.trim()) { err.textContent = 'Inserisci il codice.'; return; }
      if (!f.getNome()) { err.textContent = 'Scrivi il tuo nome.'; return; }
      ok.disabled = true;
      try {
        await joinCouple(client, { codice: cod.value.trim().toUpperCase(), nome: f.getNome(), avatar: f.getAvatar() });
        onDone();
      } catch (e) { err.textContent = e.message; ok.disabled = false; }
    };
    const back = mk('button', 'ob-back', '← Indietro'); back.onclick = renderScelta;
    add(card, ok, err, back);
    add(root, card);
  };

  renderScelta();
}
