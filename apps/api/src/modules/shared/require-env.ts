/**
 * Fails at startup rather than at the first request. A missing JWT_SECRET that
 * defaults to undefined signs tokens anyone can forge.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
