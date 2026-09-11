import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});

export class RefreshSessionDto extends createZodDto(refreshSessionSchema) {}
