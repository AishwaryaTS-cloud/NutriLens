/** A delivery failure. `reason` is a short safe label for logs; it never contains secrets or addresses. */
export class MailError extends Error {
  constructor(reason, detail) {
    super(`mail delivery failed: ${reason}`);
    this.name = 'MailError';
    this.reason = detail === undefined ? reason : `${reason}:${detail}`;
  }
}
