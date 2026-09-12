import { Module } from "@nestjs/common";
import { ClsModule } from "nestjs-cls";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    // One storage box per request, mounted as middleware so it exists before
    // any guard runs. Without `global`, every module would have to import it.
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    HealthModule,
    IdentityModule,
  ],
})
export class AppModule {}
