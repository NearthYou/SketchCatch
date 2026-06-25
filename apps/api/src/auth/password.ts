import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_HASH_VERSION = "v1";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keyLength: number
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);

  return [
    PASSWORD_HASH_ALGORITHM,
    PASSWORD_HASH_VERSION,
    salt,
    derivedKey.toString("base64url")
  ].join(":");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, version, salt, hash] = storedHash.split(":");

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    version !== PASSWORD_HASH_VERSION ||
    !salt ||
    !hash
  ) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  const storedKey = Buffer.from(hash, "base64url");

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}
