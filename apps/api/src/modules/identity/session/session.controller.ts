import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import { LogInDto } from "./log-in.dto";
import { LogIn, type IssuedSession } from "./log-in.use-case";

@Controller("auth")
export class SessionController {
  constructor(private readonly logIn: LogIn) {}

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
}
