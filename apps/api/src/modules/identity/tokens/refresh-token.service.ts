import { Injectable } from "@nestjs/common";
import { randomBytes, createHash, randomUUID } from "node:crypto";

import { PrismaService } from "../../shared/prisma/prisma.service";
import type { Prisma } from "@prisma/client";

const REFRESH_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_TTL_DAYS = 7;

export interface IssuedRefreshToken {
  readonly id: string;
  /** Returned to the caller once, then never recoverable from the database. */
  readonly token: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SHA-256 rather than argon2: this is 256 bits of randomness, not a guessable
   * password, so there is nothing to brute-force and we need the lookup by hash
   * to be fast. Hashing at all is what stops a leaked database from handing
   * over live sessions.
   */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async issue(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const created = await tx.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: this.hashToken(token),
        familyId,
        expiresAt,
      },
    });

    return { id: created.id, token, familyId, expiresAt };
  }

  /**
   * Kills every live token descended from one login. Called when a dead token
   * is presented, which proves the token was copied.
   */
  async revokeFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
  ): Promise<number> {
    const { count } = await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return count;
  }
}
