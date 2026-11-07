import { api } from './api.js';

/** Returns { profile, options }: the user's saved choices plus the lists the form is built from. */
export async function fetchProfile() {
  const { data } = await api.get('/profile');
  return { profile: data.profile, options: data.options };
}

export async function savePreferences(payload) {
  const { data } = await api.put('/profile/preferences', payload);
  return data.profile;
}

/** Returns the updated public user. */
export async function updateName(name) {
  const { data } = await api.patch('/profile', { name });
  return data.user;
}
