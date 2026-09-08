import { Injectable } from "@nestjs/common";
import { hash, verify, type Algorithm } from "@node-rs/argon2";

/**
 * `Algorithm` is an ambient const enum, so its members cannot be read under
 * `isolatedModules`. The annotation still rejects any value that is not a
 * member, and 2 is Argon2id — the side-channel-resistant hybrid.
 */
const ARGON2ID: Algorithm = 2;

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

  verify(passwordHash: string, plaintext: string): Promise<boolean> {
    return verify(passwordHash, plaintext, ARGON2_OPTIONS);
  }
}
