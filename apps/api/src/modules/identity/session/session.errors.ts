import { DomainError } from "../../shared/domain-error";

export class InvalidCredentialsError extends DomainError {
  readonly code = "IDENTITY.INVALID_CREDENTIALS";

  constructor() {
    super("The login or password is incorrect.");
  }
}

/** Unknown, expired, or already revoked. Nothing more is said to the caller. */
export class InvalidRefreshTokenError extends DomainError {
  readonly code = "IDENTITY.INVALID_REFRESH_TOKEN";

  constructor() {
    super("The refresh token is not valid.");
  }
}

/**
 * A token that was already rotated has been presented again. A real client
 * never does this, so two parties hold the token and the whole family is dead.
 * The caller sees the same 401 as any other bad token; only the log knows.
 */
export class RefreshTokenReusedError extends DomainError {
  readonly code = "IDENTITY.INVALID_REFRESH_TOKEN";

  constructor(readonly familyId: string) {
    super("The refresh token was already used.");
  }
}
