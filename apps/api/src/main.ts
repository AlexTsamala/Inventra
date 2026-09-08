import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Every DTO built with createZodDto is validated by its own schema, so a
  // controller never sees an unvalidated body.
  app.useGlobalPipes(new ZodValidationPipe());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
