const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function emailError(email) {
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return undefined;
}

function passwordRuleError(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Use at least 8 characters.';
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Use 72 bytes or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return undefined;
}

function result(errors, value) {
  return { valid: Object.keys(errors).length === 0, errors, value };
}

export function validateRegistration(input) {
  const body = input !== null && typeof input === 'object' ? input : {};
  const name = cleanText(body.name);
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = {};
  if (name.length < 2 || name.length > 60) errors.name = 'Enter your name (2 to 60 characters).';
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  const passwordProblem = passwordRuleError(password);
  if (passwordProblem) errors.password = passwordProblem;

  return result(errors, { name, email, password });
}

export function validateLogin(input) {
  const body = input !== null && typeof input === 'object' ? input : {};
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = {};
  const emailProblem = emailError(email);
  if (emailProblem) errors.email = emailProblem;
  if (!password) errors.password = 'Enter your password.';

  return result(errors, { email, password });
}
