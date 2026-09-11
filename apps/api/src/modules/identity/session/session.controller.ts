import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

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
  ) {}

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
}
