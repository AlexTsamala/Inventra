import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { Public } from "../../shared/public.decorator";
import { TenantContext } from "../../shared/tenant-context/tenant-context";
import { LogInDto } from "./log-in.dto";
import { LogIn, type IssuedSession } from "./log-in.use-case";
import { RefreshSessionDto } from "./refresh-session.dto";
import { RefreshSession } from "./refresh-session.use-case";
import { RefreshTokenReusedError } from "./session.errors";

@Controller("auth")
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(
    private readonly logIn: LogIn,
    private readonly refreshSession: RefreshSession,
    private readonly tenantContext: TenantContext,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LogInDto): Promise<IssuedSession> {
    const result = await this.logIn.execute({
      login: body.login,
      password: body.password,
    });

    if (!result.ok) {
      throw new UnauthorizedException(result.error.code);
    }

    return result.value;
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshSessionDto): Promise<IssuedSession> {
    const result = await this.refreshSession.execute({
      refreshToken: body.refreshToken,
    });

    if (!result.ok) {
      // A reused token is a security event worth seeing in the log. The caller
      // still gets the same 401 as any other bad token.
      if (result.error instanceof RefreshTokenReusedError) {
        this.logger.warn(
          `Refresh token reused — revoked family ${result.error.familyId}`,
        );
      }

      throw new UnauthorizedException(result.error.code);
    }

    return result.value;
  }

  /**
   * Protected by the global guard. Every value here comes from TenantContext,
   * which the guard filled from the token — nothing was read off the request.
   */
  @Get("me")
  me(): { userId: string; tenantId: string; role: string } {
    return {
      userId: this.tenantContext.userId,
      tenantId: this.tenantContext.tenantId,
      role: this.tenantContext.role,
    };
  }
}
