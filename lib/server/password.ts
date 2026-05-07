import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "crypto";

const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

function scrypt(password: string, salt: string, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (err, key) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    cost,
    blockSize,
    parallelization,
    salt,
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, costPart, blockSizePart, parallelizationPart, salt, hash] =
    encoded.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const key = await scrypt(password, salt, {
    N: Number(costPart),
    r: Number(blockSizePart),
    p: Number(parallelizationPart),
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, "base64url");

  return key.length === expected.length && timingSafeEqual(key, expected);
}
