import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Argon2id parameters.
 *
 * - memoryCost: 64 MiB
 * - timeCost: 3 iterations
 * - parallelism: 4 lanes
 * - outputLen: 32 bytes
 * - algorithm: 2 === Argon2id
 *
 * These follow the OWASP / RFC 9106 second-recommended parameter set. Argon2id
 * is used to satisfy the application's password-hashing requirement. The
 * parameters are intentionally conservative for a single-user app while still
 * being meaningfully expensive to brute force.
 */
const argon2Options: Options = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
  algorithm: 2,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, argon2Options);
}

export async function verifyPassword(data: {
  password: string;
  hash: string;
}): Promise<boolean> {
  try {
    return await verify(data.hash, data.password, argon2Options);
  } catch {
    // Malformed hash or verification failure: treat as invalid credentials.
    return false;
  }
}
