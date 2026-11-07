import axios from 'axios';

/**
 * Development: relative URL, forwarded to Express by the Vite proxy.
 * Production: VITE_API_BASE_URL points at the deployed API.
 * The long timeout allows for a free-tier server waking from sleep (about a minute).
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({
  baseURL,
  timeout: 70_000,
  withCredentials: true,
});
