import { DomainError } from '../shared/domain-error';

export class LoginAlreadyTakenError extends DomainError {
  readonly code = 'IDENTITY.LOGIN_ALREADY_TAKEN';

  constructor(readonly login: string) {
    super(`A user already exists with login "${login}".`);
  }
}

/**
 * Not a domain failure — the roles are reference data every tenant shares, so
 * their absence means `pnpm db:seed` never ran against this database.
 */
export class OwnerRoleMissingError extends Error {
  constructor() {
    super('The OWNER role is not seeded. Run `pnpm db:seed`.');
    this.name = 'OwnerRoleMissingError';
  }
}
