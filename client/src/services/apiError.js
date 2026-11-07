const GENERIC = 'Something went wrong. Please try again.';
const NETWORK = 'Can’t reach the server. Check your connection and try again.';

/**
 * Turns any request failure into one shape the UI can render:
 * { status, code, message, fieldErrors }. fieldErrors maps field names to messages.
 */
export function toApiError(error) {
  const response = error?.response;
  if (response) {
    const body = response.data?.error;
    const details = body?.details;
    return {
      status: response.status,
      code: body?.code ?? 'UNKNOWN_ERROR',
      message: body?.message ?? GENERIC,
      fieldErrors: details && typeof details === 'object' ? details : {},
    };
  }
  if (error?.request || error?.code === 'ECONNABORTED' || error?.code === 'ERR_NETWORK') {
    return { status: 0, code: 'NETWORK_ERROR', message: NETWORK, fieldErrors: {} };
  }
  return { status: 0, code: 'CLIENT_ERROR', message: GENERIC, fieldErrors: {} };
}
