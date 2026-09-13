import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { requireEnv } from "../require-env";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Not DATABASE_URL. That one owns the tables and is a superuser, which
    // bypasses row-level security. The running app must be an ordinary role or
    // the policies are decoration.
    super({ datasourceUrl: requireEnv("APP_DATABASE_URL") });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
