import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [HealthModule, IdentityModule],
})
export class AppModule {}
