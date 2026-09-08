import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Deliberately not @Global: a module that touches the database should say so in
 * its own imports.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
