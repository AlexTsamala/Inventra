import { describe, expect, it } from 'vitest';

import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an argon2id hash, never the plaintext', async () => {
    const result = await hasher.hash('correct horse battery staple');

    expect(result).toMatch(/^\$argon2id\$/);
    expect(result).not.toContain('correct horse battery staple');
  });

  it('accepts the right password', async () => {
    const result = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(result, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const result = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(result, 'Correct horse battery staple')).resolves.toBe(false);
  });

  it('salts each hash, so identical passwords do not collide', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('same password'),
      hasher.hash('same password'),
    ]);

    // Two users with the same password must not be identifiable from the column.
    expect(first).not.toBe(second);
    await expect(hasher.verify(first, 'same password')).resolves.toBe(true);
    await expect(hasher.verify(second, 'same password')).resolves.toBe(true);
  });
});
