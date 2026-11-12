/**
 * Minimal Gemini REST client (official Gemini API, generateContent). Uses the built-in fetch, so
 * no SDK dependency. The API key is sent in a header (never in the URL) and never logged.
 * Server-side only: the key must never reach the browser.
 */
export class GeminiError extends Error {
  /** @param {'GEMINI_NOT_CONFIGURED'|'GEMINI_QUOTA'|'GEMINI_UNAVAILABLE'|'GEMINI_AUTH'|'GEMINI_MODEL'|'GEMINI_TIMEOUT'|'GEMINI_BLOCKED'|'GEMINI_BAD_RESPONSE'|'GEMINI_LIMIT'} code */
  constructor(code, message, { status, retryAfterSeconds } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function toGeminiError(err) {
  if (err instanceof GeminiError) return err;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return new GeminiError('GEMINI_TIMEOUT', 'Gemini took too long to answer.');
  return new GeminiError('GEMINI_UNAVAILABLE', 'Gemini could not be reached.');
}

export function classifyHttpError(status, bodyText) {
  let reason = '';
  try {
    const parsed = JSON.parse(bodyText);
    reason = String(parsed?.error?.status ?? '');
  } catch { /* body is not JSON */ }
  if (status === 429 || reason === 'RESOURCE_EXHAUSTED') return new GeminiError('GEMINI_QUOTA', 'The Gemini free-tier quota or rate limit was reached.', { status });
  if (status === 401 || status === 403 || reason === 'PERMISSION_DENIED' || reason === 'UNAUTHENTICATED') return new GeminiError('GEMINI_AUTH', 'The Gemini API key was rejected.', { status });
  if (status === 404) return new GeminiError('GEMINI_MODEL', 'The configured Gemini model was not found.', { status });
  if (status === 400) return new GeminiError(reason === 'FAILED_PRECONDITION' ? 'GEMINI_AUTH' : 'GEMINI_BAD_RESPONSE', 'Gemini rejected the request.', { status });
  return new GeminiError('GEMINI_UNAVAILABLE', 'Gemini is temporarily unavailable.', { status });
}

/**
 * @param {{ apiKey?: string, model: string, timeoutMs?: number, fetchImpl?: typeof fetch,
 *           retryDelayMs?: number, dailyLimit?: number, now?: () => Date, logger?: object }} options
 */
export function createGeminiClient({ apiKey, model, timeoutMs = 45000, fetchImpl = globalThis.fetch, retryDelayMs = 800, dailyLimit = 0, now = () => new Date(), logger } = {}) {
  let counterDay = '';
  let counter = 0;

  function countCall() {
    const day = now().toISOString().slice(0, 10);
    if (day !== counterDay) {
      counterDay = day;
      counter = 0;
    }
    if (dailyLimit > 0 && counter >= dailyLimit) {
      throw new GeminiError('GEMINI_LIMIT', 'The daily Gemini request limit set for this app was reached.');
    }
    counter += 1;
  }

  async function post(body) {
    const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw classifyHttpError(response.status, text);
    return text;
  }

  return {
    isConfigured: Boolean(apiKey),
    model,
    /**
     * Sends one generateContent request and returns the parsed JSON object produced by the model.
     * `parts` = Gemini content parts (text and/or inlineData). `schema` = responseSchema.
     */
    async generateJson({ systemInstruction, parts, schema, temperature = 0, maxOutputTokens = 8192 }) {
      if (!apiKey) throw new GeminiError('GEMINI_NOT_CONFIGURED', 'GEMINI_API_KEY is not set.');
      countCall();
      const body = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
      };
      let text;
      try {
        try {
          text = await post(body);
        } catch (err) {
          const first = toGeminiError(err);
          if (first.code !== 'GEMINI_UNAVAILABLE' || first.status === undefined) throw first;
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs)); // one retry for a temporary server error
          text = await post(body);
        }
      } catch (err) {
        const failure = toGeminiError(err);
        logger?.warn('gemini request failed', { code: failure.code, status: failure.status });
        throw failure;
      }

      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new GeminiError('GEMINI_BAD_RESPONSE', 'Gemini sent a response that could not be read.');
      }
      if (envelope?.promptFeedback?.blockReason) throw new GeminiError('GEMINI_BLOCKED', 'Gemini declined to process this image.');
      const candidate = envelope?.candidates?.[0];
      const finish = candidate?.finishReason;
      if (finish && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(finish)) {
        throw new GeminiError(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'IMAGE_SAFETY', 'RECITATION'].includes(finish) ? 'GEMINI_BLOCKED' : 'GEMINI_BAD_RESPONSE', `Gemini stopped early (${finish}).`);
      }
      const output = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
      if (!output) throw new GeminiError('GEMINI_BAD_RESPONSE', 'Gemini returned an empty answer.');
      try {
        const parsed = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        return parsed;
      } catch {
        throw new GeminiError('GEMINI_BAD_RESPONSE', 'Gemini returned malformed JSON.');
      }
    },
  };
}
