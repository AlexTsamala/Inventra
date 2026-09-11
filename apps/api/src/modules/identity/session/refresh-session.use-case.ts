import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../../shared/prisma/prisma.service";
import { err, ok, type Result } from "../../shared/result";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
} from "../tokens/access-token";
import { RefreshTokenService } from "../tokens/refresh-token.service";
import type { IssuedSession } from "./log-in.use-case";
import {
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from "./session.errors";

type RefreshFailure = InvalidRefreshTokenError | RefreshTokenReusedError;

export interface RefreshSessionCommand {
  readonly refreshToken: string;
}

@Injectable()
export class RefreshSession {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
  ) {}

  async execute(
    command: RefreshSessionCommand,
  ): Promise<Result<IssuedSession, RefreshFailure>> {
    const tokenHash = this.refreshTokens.hashToken(command.refreshToken);

    const presented = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (presented === null) {
      return err(new InvalidRefreshTokenError());
    }

    // Already rotated or already revoked. A real client never sends a token it
    // has traded in, so this one was copied.
    if (presented.revokedAt !== null || presented.replacedById !== null) {
      await this.prisma.$transaction((tx) =>
        this.refreshTokens.revokeFamily(tx, presented.familyId),
      );

      return err(new RefreshTokenReusedError(presented.familyId));
    }

    if (presented.expiresAt.getTime() <= Date.now()) {
      return err(new InvalidRefreshTokenError());
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      // Claim the rotation with a conditional update. Two requests arriving at
      // once both read the row as live; only the one whose UPDATE matches
      // `revokedAt: null` gets count 1, so only one rotation can happen.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: presented.id, revokedAt: null, replacedById: null },
        data: { revokedAt: new Date() },
      });

      if (claimed.count === 0) {
        return null;
      }

      const next = await this.refreshTokens.issue(
        tx,
        presented.userId,
        presented.tenantId,
        presented.familyId,
      );

      await tx.refreshToken.update({
        where: { id: presented.id },
        data: { replacedById: next.id },
      });

      return next;
    });

    if (issued === null) {
      await this.prisma.$transaction((tx) =>
        this.refreshTokens.revokeFamily(tx, presented.familyId),
      );

      return err(new RefreshTokenReusedError(presented.familyId));
    }

    const claims: AccessTokenClaims = {
      sub: presented.user.id,
      tid: presented.user.tenantId,
      role: presented.user.role.code,
    };

    return ok({
      accessToken: await this.jwt.signAsync(claims),
      refreshToken: issued.token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}
