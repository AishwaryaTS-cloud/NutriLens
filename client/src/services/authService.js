import { api } from './api.js';

/** Each call returns the public user object ({ id, name, email, createdAt }). */
export async function register({ name, email, password }) {
  const { data } = await api.post('/auth/register', { name, email, password });
  return data.user;
}

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.user;
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me');
  return data.user;
}
