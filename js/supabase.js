// Carica supabase-js (via CDN, importato in index.html come modulo globale `supabase`)
// e crea il client dai valori di config.js.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Guard per ambienti senza window (es. Node.js durante i test)
export const client = typeof window !== 'undefined'
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export async function getSession() {
  const { data } = await client.auth.getSession();
  return data.session;
}
