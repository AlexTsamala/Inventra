import { Injectable } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * `Algorithm` is an ambient const enum, so its members cannot be read under
 * `isolatedModules`. The annotation still rejects any value that is not a
 * member, and 2 is Argon2id — the side-channel-resistant hybrid.
 */
const ARGON2ID: Algorithm = 2;

/**
 * OWASP's balanced argon2id configuration. Memory cost is the knob that
 * actually degrades a GPU attack, so it carries the weight here; 47 MiB would
 * be stronger still but allocates per concurrent login on a small host.
 *
 * These values are encoded into the hash string, so raising them later leaves
 * existing hashes verifiable — re-hash on the next successful login.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  hash(plaintext: string): Promise<string> {
    return hash(plaintext, ARGON2_OPTIONS);
  }

  /**
   * Constant-time inside argon2 — never compare hash strings with `===`.
   */
  verify(passwordHash: string, plaintext: string): Promise<boolean> {
    return verify(passwordHash, plaintext, ARGON2_OPTIONS);
  }
}
