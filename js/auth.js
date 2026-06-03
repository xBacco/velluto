import { client as defaultClient } from './supabase.js';

export async function login(email, password, client = defaultClient) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Email o password non corretti.');
  return data.user;
}

export async function logout(client = defaultClient) {
  await client.auth.signOut();
}

// Registrazione. Con conferma email ON non apre sessione finché l'utente non conferma.
export async function signUp(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

// Invio email di reset password.
export async function resetPasswordForEmail(client, email) {
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

// Profilo del coniuge loggato (id, couple_id, display_name, avatar).
// Ritorna null se non c'è sessione O se l'utente non ha ancora un profilo (→ onboarding).
// Lancia solo su errori di rete/DB reali.
export async function currentProfile(client = defaultClient) {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Errore profilo: ' + error.message);
  return data || null;
}
