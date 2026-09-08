export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Deliberately small. Every claim here is a fact frozen for up to 15 minutes,
 * so permissions are looked up per request rather than embedded — revoking a
 * permission should not wait for a token to expire.
 */
export interface AccessTokenClaims {
  /** User id. */
  readonly sub: string;
  /** Tenant id. The only source TenantContext will trust. */
  readonly tid: string;
  readonly role: string;
}
