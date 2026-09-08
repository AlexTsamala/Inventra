import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../shared/prisma/prisma.service";
import { err, ok, type Result } from "../../shared/result";
import { PasswordHasher } from "../passwords/password-hasher";
import {
  LoginAlreadyTakenError,
  OwnerRoleMissingError,
} from "./registration.errors";

const OWNER_ROLE_CODE = "OWNER";
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export interface RegisterTenantCommand {
  readonly tenantName: string;
  readonly ownerName: string;
  readonly login: string;
  readonly password: string;
}

export interface RegisteredTenant {
  readonly tenantId: string;
  readonly ownerId: string;
}

@Injectable()
export class RegisterTenant {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(
    command: RegisterTenantCommand,
  ): Promise<Result<RegisteredTenant, LoginAlreadyTakenError>> {
    const passwordHash = await this.passwordHasher.hash(command.password);

    const ownerRole = await this.prisma.role.findUnique({
      where: { code: OWNER_ROLE_CODE },
    });

    if (ownerRole === null) {
      throw new OwnerRoleMissingError();
    }

    try {
      const registered = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: command.tenantName },
        });

        // A tenant with no owner is a company nobody can log into, so this
        // insert and the one above commit together or not at all.
        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: command.ownerName,
            login: command.login,
            passwordHash,
            roleId: ownerRole.id,
          },
        });

        return { tenantId: tenant.id, ownerId: owner.id };
      });

      return ok(registered);
    } catch (error) {
      // The unique index is the only race-free guard. Looking the login up
      // first would let two simultaneous signups both find it free.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        return err(new LoginAlreadyTakenError(command.login));
      }

      throw error;
    }
  }
}
