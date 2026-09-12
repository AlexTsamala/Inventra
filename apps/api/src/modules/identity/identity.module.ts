import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { PrismaModule } from "../shared/prisma/prisma.module";
import { requireEnv } from "../shared/require-env";
import { TenantContextModule } from "../shared/tenant-context/tenant-context.module";
import { PasswordHasher } from "./passwords/password-hasher";
import { RegisterTenant } from "./registration/register-tenant.use-case";
import { RegistrationController } from "./registration/registration.controller";
import { JwtAuthGuard } from "./session/jwt-auth.guard";
import { LogIn } from "./session/log-in.use-case";
import { RefreshSession } from "./session/refresh-session.use-case";
import { SessionController } from "./session/session.controller";
import { ACCESS_TOKEN_TTL_SECONDS } from "./tokens/access-token";
import { RefreshTokenService } from "./tokens/refresh-token.service";

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireEnv("JWT_SECRET"),
        signOptions: {
          algorithm: "HS256",
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
      }),
    }),
  ],
  controllers: [RegistrationController, SessionController],
  providers: [
    PasswordHasher,
    RefreshTokenService,
    RegisterTenant,
    LogIn,
    RefreshSession,
    // APP_GUARD makes this run on every route in the application, not just
    // this module's. Endpoints are closed by default; @Public() opens one.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [RegisterTenant, LogIn, RefreshSession],
})
export class IdentityModule {}
