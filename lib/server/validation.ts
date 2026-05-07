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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = "email is invalid";
  }

  if (input.password.length < 10) {
    errors.password = "password must be at least 10 characters";
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
    turnstileToken: asString(body.turnstileToken || body["cf-turnstile-response"]),
  };

  const errors: Record<string, string> = {};
  if (!input.identifier || !input.password) {
    errors.form = "invalid credentials";
  }

  return { input, errors };
}

export function parseScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter(item => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  return ["profile:read"];
}
