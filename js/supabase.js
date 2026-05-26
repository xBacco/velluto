// Carica supabase-js (via CDN, importato in index.html come modulo globale `supabase`)
// e crea il client dai valori di config.js.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data } = await client.auth.getSession();
  return data.session;
}
