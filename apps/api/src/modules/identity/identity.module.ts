import { Module } from '@nestjs/common';

import { PrismaModule } from '../shared/prisma/prisma.module';
import { PasswordHasher } from './password-hasher';
import { RegisterTenant } from './register-tenant.use-case';
import { RegistrationController } from './registration.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RegistrationController],
  providers: [PasswordHasher, RegisterTenant],
  exports: [RegisterTenant],
})
export class IdentityModule {}
