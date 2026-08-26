export type AuthField =
  | "displayName"
  | "username"
  | "email"
  | "password"
  | "confirmPassword";

export type AuthFieldErrors = Partial<Record<AuthField, string>>;

export type AuthValidationResult = {
  valid: boolean;
  errors: AuthFieldErrors;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[A-Za-z0-9_]{3,30}$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateLogin(input: {
  email: string;
  password: string;
}): AuthValidationResult {
  const errors: AuthFieldErrors = {};
  const email = normalizeEmail(input.email);

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!input.password) {
    errors.password = "Enter your password.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSignup(input: {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}): AuthValidationResult {
  const errors: AuthFieldErrors = {};
  const displayName = input.displayName.trim();
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);

  if (!displayName) {
    errors.displayName = "Enter your display name.";
  } else if (displayName.length > 80) {
    errors.displayName = "Display name must be 80 characters or fewer.";
  }

  if (!username) {
    errors.username = "Choose a username.";
  } else if (!usernamePattern.test(username)) {
    errors.username = "Use 3–30 letters, numbers, or underscores.";
  }

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!input.password) {
    errors.password = "Create a password.";
  } else if (input.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (!/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
    errors.password = "Password must include a letter and a number.";
  }

  if (!input.confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

function errorText(error: AuthErrorLike | null | undefined) {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

export function loginErrorMessage(error: AuthErrorLike | null | undefined) {
  const text = errorText(error);
  if (text.includes("email_not_confirmed") || text.includes("email not confirmed")) {
    return "Verify your email before logging in.";
  }
  if (
    text.includes("invalid_credentials") ||
    text.includes("invalid login credentials")
  ) {
    return "Incorrect email or password.";
  }
  if (
    error?.status === 429 ||
    text.includes("rate limit") ||
    text.includes("too many")
  ) {
    return "Too many login attempts. Wait a moment and try again.";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("timeout")
  ) {
    return "Unable to reach Social 24x7. Check your connection and try again.";
  }
  return "Unable to log in right now. Please try again.";
}

export function signupErrorMessage(error: AuthErrorLike | null | undefined) {
  const text = errorText(error);
  if (
    text.includes("user_already_exists") ||
    text.includes("already registered") ||
    text.includes("already exists")
  ) {
    return "An account may already exist for this email. Try logging in instead.";
  }
  if (text.includes("weak_password") || text.includes("weak password")) {
    return "Use at least 8 characters with a letter and a number.";
  }
  if (text.includes("email") && text.includes("invalid")) {
    return "Enter a valid email address.";
  }
  if (
    error?.status === 429 ||
    text.includes("rate limit") ||
    text.includes("too many")
  ) {
    return "Too many signup attempts. Wait a moment and try again.";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("timeout")
  ) {
    return "Unable to reach Social 24x7. Check your connection and try again.";
  }
  return "Unable to create your account right now. Please try again.";
}

export function isDuplicateSignupResponse(user: {
  identities?: unknown[] | null;
} | null | undefined) {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
