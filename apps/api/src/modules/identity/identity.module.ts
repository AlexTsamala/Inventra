import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { PrismaModule } from "../shared/prisma/prisma.module";
import { requireEnv } from "../shared/require-env";
import { PasswordHasher } from "./passwords/password-hasher";
import { RegisterTenant } from "./registration/register-tenant.use-case";
import { RegistrationController } from "./registration/registration.controller";
import { LogIn } from "./session/log-in.use-case";
import { RefreshSession } from "./session/refresh-session.use-case";
import { SessionController } from "./session/session.controller";
import { ACCESS_TOKEN_TTL_SECONDS } from "./tokens/access-token";
import { RefreshTokenService } from "./tokens/refresh-token.service";

@Module({
  imports: [
    PrismaModule,
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
  ],
  exports: [RegisterTenant, LogIn, RefreshSession],
})
export class IdentityModule {}
