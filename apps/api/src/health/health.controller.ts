import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; sha: string } {
    return {
      status: "ok",
      sha: process.env.BUILD_SHA ?? "local",
    };
  }
}
