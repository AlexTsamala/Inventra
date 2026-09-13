import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { ScopedPrisma } from "../../shared/prisma/scoped-prisma";
import { err, ok, type Result } from "../../shared/result";
import { PasswordHasher } from "../passwords/password-hasher";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
} from "../tokens/access-token";
import { RefreshTokenService } from "../tokens/refresh-token.service";
import { InvalidCredentialsError } from "./session.errors";

/**
 * A real argon2id hash of a random string nobody knows. Verifying against it
 * when the login does not exist makes a miss cost the same ~80ms as a hit —
 * otherwise an instant rejection tells an attacker the address is unregistered,
 * which is the enumeration hole we closed on registration reopened on login.
 */
const ABSENT_USER_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$C+wUZPwYESbZuwFnaVHHSg$dqWUMkPOMgydZy/KPXhJgfheCYfCFL2XrTrhrNx89MI";

export interface LogInCommand {
  readonly login: string;
  readonly password: string;
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

@Injectable()
export class LogIn {
  constructor(
    private readonly scoped: ScopedPrisma,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
  ) {}

  async execute(
    command: LogInCommand,
  ): Promise<Result<IssuedSession, InvalidCredentialsError>> {
    // Bypass: logins are unique across the whole system, so finding which
    // tenant this person belongs to is the question being asked.
    const user = await this.scoped.bypassTenantIsolation((tx) =>
      tx.user.findUnique({
        where: { login: command.login },
        include: { role: true },
      }),
    );

    if (user === null) {
      await this.passwordHasher.verify(ABSENT_USER_HASH, command.password);
      return err(new InvalidCredentialsError());
    }

    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash,
      command.password,
    );

    if (!passwordMatches) {
      return err(new InvalidCredentialsError());
    }

    const refreshToken = await this.scoped.bypassTenantIsolation(async (tx) => {
      const issued = await this.refreshTokens.issue(tx, user.id, user.tenantId);

      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return issued;
    });

    const claims: AccessTokenClaims = {
      sub: user.id,
      tid: user.tenantId,
      role: user.role.code,
    };

    return ok({
      accessToken: await this.jwt.signAsync(claims),
      refreshToken: refreshToken.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}
