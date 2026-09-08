/**
 * Every expected failure in the system is one of these, never a bare Error and
 * never a string. `code` is what crosses the wire; `message` is for humans.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
