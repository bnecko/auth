import { verifyPassword } from "./password";
import { findPasswordHashById } from "./repositories/users";

// The check asked of a signed-in user before a change that a stolen session
// alone must not be able to make: where money is paid, or what can sign in. A
// session proves someone once signed in on that browser. It does not prove the
// person at it now is them.
export async function isCurrentPassword(userId: number, password: string) {
  if (!password) return false;
  const creds = await findPasswordHashById(userId);
  return Boolean(creds && (await verifyPassword(password, creds.password_hash)));
}
