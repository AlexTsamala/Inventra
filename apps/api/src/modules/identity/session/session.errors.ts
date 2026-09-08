import { DomainError } from "../../shared/domain-error";

export class InvalidCredentialsError extends DomainError {
  readonly code = "IDENTITY.INVALID_CREDENTIALS";

  constructor() {
    super("The login or password is incorrect.");
  }
}
