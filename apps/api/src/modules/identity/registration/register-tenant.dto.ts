import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const registerTenantSchema = z.object({
  tenantName: z.string().trim().min(1).max(200),
  ownerName: z.string().trim().min(1).max(200),
  login: z.email().max(254),
  password: z.string().min(12).max(128),
});

export class RegisterTenantDto extends createZodDto(registerTenantSchema) {}
