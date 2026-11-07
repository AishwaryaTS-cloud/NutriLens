const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function emailError(value) {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return undefined;
}

function passwordRuleError(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (new TextEncoder().encode(password).length > 72) return 'Use 72 bytes or fewer.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return undefined;
}

function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

export function validateLoginForm({ email = '', password = '' }) {
  return compact({
    email: emailError(email),
    password: password ? undefined : 'Enter your password.',
  });
}

export function validateRegisterForm({ name = '', email = '', password = '', confirmPassword = '' }) {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  return compact({
    name: cleanName.length < 2 || cleanName.length > 60 ? 'Enter your name (2 to 60 characters).' : undefined,
    email: emailError(email),
    password: passwordRuleError(password),
    confirmPassword: confirmPassword === password ? undefined : 'The passwords don’t match.',
  });
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
