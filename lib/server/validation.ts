import { normalizeIdentifier } from "./crypto";

export type RegistrationInput = {
  firstName: string;
  username: string;
  bio: string | null;
  email: string;
  dob: string | null;
  password: string;
  turnstileToken?: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
  remember: boolean;
  turnstileToken?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const text = asString(value);
  return text || null;
}

export function parseRegistrationInput(body: Record<string, unknown>) {
  const input: RegistrationInput = {
    firstName: asString(body.first_name || body.firstName),
    username: asString(body.username),
    bio: optionalString(body.bio),
    email: asString(body.email),
    dob: optionalString(body.dob),
    password: asString(body.password),
    turnstileToken: asString(body.turnstileToken || body["cf-turnstile-response"]),
  };

  const errors: Record<string, string> = {};

  if (!input.firstName || input.firstName.length > 80) {
    errors.firstName = "first name is required";
  }

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(input.username)) {
    errors.username = "username must be 3-32 letters, numbers, or underscores";
  }

  if (input.bio && input.bio.length > 240) {
    errors.bio = "bio must be 240 characters or fewer";
  }

  if (input.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = "email is invalid";
  }

  // Cap password length: scrypt hashes the input regardless of length,
  // so an unbounded password lets a single request burn 64 MiB and
  // significant CPU. 256 chars is well above any reasonable passphrase.
  if (input.password.length < 10 || input.password.length > 256) {
    errors.password = "password must be 10-256 characters";
  }

  if (input.dob) {
    const parsed = new Date(`${input.dob}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed > new Date()) {
      errors.dob = "date of birth is invalid";
    }
  }

  return {
    input: {
      ...input,
      username: normalizeIdentifier(input.username),
      email: normalizeIdentifier(input.email),
    },
    errors,
  };
}

export function parseLoginInput(body: Record<string, unknown>) {
  const input: LoginInput = {
    identifier: normalizeIdentifier(asString(body.identifier)),
    password: asString(body.password),
    remember: body.remember === "on" || body.remember === "true",
    turnstileToken: asString(body.turnstileToken || body["cf-turnstile-response"]),
  };

  const errors: Record<string, string> = {};
  if (!input.identifier || !input.password) {
    errors.form = "invalid credentials";
  }

  return { input, errors };
}

// Allowlist of scopes external apps may request. Documented in
// docs/external-apps.md. The activation approval UI only renders scopes
// it knows how to label, so accepting unknown scope strings would let
// an external app trick a user into approving a scope they never see.
const ALLOWED_SCOPES = new Set([
  "profile:read",
  "email:read",
  "dob:read",
  "subscription:read",
]);

export function parseScopes(value: unknown) {
  let candidates: string[];

  if (Array.isArray(value)) {
    candidates = value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean);
  } else if (typeof value === "string") {
    candidates = value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  } else {
    return ["profile:read"];
  }

  const filtered = candidates.filter(scope => ALLOWED_SCOPES.has(scope));
  if (candidates.length > 0 && filtered.length !== candidates.length) {
    const unknown = candidates.find(scope => !ALLOWED_SCOPES.has(scope));
    throw new Error(`unknown scope: ${unknown}`);
  }

  return filtered.length > 0 ? filtered : ["profile:read"];
}
