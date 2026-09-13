import { Module } from "@nestjs/common";

import { TenantContextModule } from "../tenant-context/tenant-context.module";
import { PrismaService } from "./prisma.service";
import { ScopedPrisma } from "./scoped-prisma";

@Module({
  imports: [TenantContextModule],
  providers: [PrismaService, ScopedPrisma],
  exports: [PrismaService, ScopedPrisma],
})
export class PrismaModule {}
