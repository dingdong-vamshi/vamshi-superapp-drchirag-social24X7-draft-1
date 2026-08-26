import assert from "node:assert/strict";
import test from "node:test";
import {
  isDuplicateSignupResponse,
  loginErrorMessage,
  normalizeEmail,
  normalizeUsername,
  signupErrorMessage,
  validateLogin,
  validateSignup,
} from "./authValidation.ts";

test("normalizes email and username without changing passwords", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizeUsername("  Social_User "), "social_user");
});

test("login validation rejects missing and malformed values", () => {
  assert.deepEqual(validateLogin({ email: "bad", password: "" }).errors, {
    email: "Enter a valid email address.",
    password: "Enter your password.",
  });
  assert.equal(
    validateLogin({ email: "person@example.com", password: " secret " }).valid,
    true,
  );
});

test("signup validation enforces profile, username, email, and password rules", () => {
  const result = validateSignup({
    displayName: "",
    username: "ab-",
    email: "missing-domain",
    password: "password",
    confirmPassword: "different",
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.displayName, "Enter your display name.");
  assert.equal(result.errors.username, "Use 3–30 letters, numbers, or underscores.");
  assert.equal(result.errors.email, "Enter a valid email address.");
  assert.equal(result.errors.password, "Password must include a letter and a number.");
  assert.equal(result.errors.confirmPassword, "Passwords do not match.");
});

test("signup validation accepts a production-ready payload", () => {
  assert.equal(
    validateSignup({
      displayName: "Social Tester",
      username: "social_tester_26",
      email: "tester@example.com",
      password: "Securepass9",
      confirmPassword: "Securepass9",
    }).valid,
    true,
  );
});

test("maps authentication failures to safe user-facing messages", () => {
  assert.equal(
    loginErrorMessage({ code: "invalid_credentials" }),
    "Incorrect email or password.",
  );
  assert.equal(
    loginErrorMessage({ code: "email_not_confirmed" }),
    "Verify your email before logging in.",
  );
  assert.equal(
    signupErrorMessage({ message: "User already registered" }),
    "An account may already exist for this email. Try logging in instead.",
  );
  assert.equal(
    signupErrorMessage({ message: "database internals leaked here" }),
    "Unable to create your account right now. Please try again.",
  );
});

test("detects Supabase duplicate-signup obfuscation responses", () => {
  assert.equal(isDuplicateSignupResponse({ identities: [] }), true);
  assert.equal(isDuplicateSignupResponse({ identities: [{}] }), false);
  assert.equal(isDuplicateSignupResponse(null), false);
});
