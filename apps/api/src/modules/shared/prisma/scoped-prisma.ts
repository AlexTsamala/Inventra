import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { TenantContext } from "../tenant-context/tenant-context";
import { PrismaService } from "./prisma.service";

const TENANT_SETTING = "app.current_tenant";
const BYPASS = "bypass";

type Work<T> = (tx: Prisma.TransactionClient) => Promise<T>;

@Injectable()
export class ScopedPrisma {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /** Every query inside sees only the current tenant's rows. */
  withTenant<T>(work: Work<T>): Promise<T> {
    return this.run(this.tenantContext.tenantId, work);
  }

  /**
   * Opens every tenant's rows. Allowed only where there is genuinely no tenant
   * yet: creating one during registration, finding a user by email at login,
   * and finding a refresh token by its hash. The name is long and ugly so that
   * any other use stands out in review.
   */
  bypassTenantIsolation<T>(work: Work<T>): Promise<T> {
    return this.run(BYPASS, work);
  }

  private run<T>(setting: string, work: Work<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // The third argument makes the setting last only for this transaction.
      // That matters because Prisma returns connections to a shared pool.
      await tx.$executeRaw`SELECT set_config(${TENANT_SETTING}, ${setting}, true)`;

      return work(tx);
    });
  }
}
