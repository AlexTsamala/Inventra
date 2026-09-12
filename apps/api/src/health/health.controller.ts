import { Controller, Get } from "@nestjs/common";

import { Public } from "../modules/shared/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): { status: "ok"; sha: string } {
    return {
      status: "ok",
      sha: process.env.BUILD_SHA ?? "local",
    };
  }
}
