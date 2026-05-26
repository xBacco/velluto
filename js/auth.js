import { client } from './supabase.js';

export async function login(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Email o password non corretti.');
  return data.user;
}

export async function logout() {
  await client.auth.signOut();
}

// Profilo del coniuge loggato (id, couple_id, display_name, avatar)
export async function currentProfile() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw new Error('Profilo non trovato: ' + error.message);
  return data;
}
