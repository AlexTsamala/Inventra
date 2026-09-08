import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const logInSchema = z.object({
  login: z.email().max(254),
  password: z.string().max(128),
});

export class LogInDto extends createZodDto(logInSchema) {}
