import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";

import { Public } from "../../shared/public.decorator";
import { RegisterTenantDto } from "./register-tenant.dto";
import { RegisterTenant } from "./register-tenant.use-case";

interface RegistrationAccepted {
  readonly status: "accepted";
}

@Controller("auth")
export class RegistrationController {
  private readonly logger = new Logger(RegistrationController.name);

  constructor(private readonly registerTenant: RegisterTenant) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  async register(
    @Body() body: RegisterTenantDto,
  ): Promise<RegistrationAccepted> {
    const result = await this.registerTenant.execute({
      tenantName: body.tenantName,
      ownerName: body.ownerName,
      login: body.login,
      password: body.password,
    });

    if (!result.ok) {
      this.logger.warn(
        `Registration attempted against an existing login: ${result.error.login}`,
      );
    }

    return { status: "accepted" };
  }
}
