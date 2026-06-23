import redis from "./redis";
import { hashToken, numericCode, safeEqual, normalizeIdentifier } from "./crypto";
import {
  rateLimit,
  readFailureCount,
  bumpFailureCount,
  clearFailureCount,
} from "./rateLimit";
import { sendEmail } from "./email";
import {
  buildVerificationEmailHtml,
  verificationEmailSubject,
  type EmailVerificationPurpose,
} from "./emailTemplates";

// Redis-backed 6-digit email verification, mirroring relinkChallenge.ts. The
// code is stored hashed, scoped to (purpose, email) so a code minted for one
// flow can't be replayed in another, with the same brute-force cap + per-target
// send throttle used elsewhere.

const TTL = 600; // 10 minutes
const MAX_EMAIL_CODE_ATTEMPTS = 5;

const emailHash = (email: string) => hashToken(normalizeIdentifier(email));
const CODE_KEY = (purpose: EmailVerificationPurpose, eh: string) => `emailverify:code:${purpose}:${eh}`;
const FAIL_KEY = (purpose: EmailVerificationPurpose, eh: string) => `emailverify:fail:${purpose}:${eh}`;
const THROTTLE_KEY = (eh: string) => `emailverify:throttle:${eh}`;
const HOURLY_KEY = (eh: string) => `emailverify:hourly:${eh}`;

// Send a fresh code to `email`. Throttled to 1/min and 5/hour per address.
// Returns { throttled: true } instead of throwing so the route can answer 429
// gracefully. Never reveals whether the address belongs to an account.
export async function requestEmailCode(
  email: string,
  purpose: EmailVerificationPurpose,
): Promise<{ sent: boolean; throttled?: boolean }> {
  const eh = emailHash(email);

  const perMinute = await rateLimit(THROTTLE_KEY(eh), 1, 60_000);
  if (!perMinute.success) return { sent: false, throttled: true };
  const perHour = await rateLimit(HOURLY_KEY(eh), 5, 60 * 60_000);
  if (!perHour.success) return { sent: false, throttled: true };

  const code = numericCode(6);
  await redis.setex(CODE_KEY(purpose, eh), TTL, hashToken(code));
  await clearFailureCount(FAIL_KEY(purpose, eh));

  await sendEmail({
    to: email,
    subject: verificationEmailSubject(purpose),
    html: buildVerificationEmailHtml({ code, purpose }),
  });

  return { sent: true };
}

// Verify a submitted code. Caps wrong tries at 5 per (purpose,email) and burns
// the code on the cap so it can't be ground down; a correct code is single-use.
export async function verifyEmailCode(
  email: string,
  purpose: EmailVerificationPurpose,
  code: string,
): Promise<boolean> {
  const eh = emailHash(email);
  const failKey = FAIL_KEY(purpose, eh);
  const codeKey = CODE_KEY(purpose, eh);

  if ((await readFailureCount(failKey)) >= MAX_EMAIL_CODE_ATTEMPTS) {
    await redis.del(codeKey);
    return false;
  }

  const stored = await redis.get(codeKey);
  if (stored && safeEqual(hashToken(code.trim()), stored)) {
    await redis.del(codeKey);
    await clearFailureCount(failKey);
    return true;
  }

  const attempts = await bumpFailureCount(failKey, TTL);
  if (attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
    await redis.del(codeKey);
  }
  return false;
}
