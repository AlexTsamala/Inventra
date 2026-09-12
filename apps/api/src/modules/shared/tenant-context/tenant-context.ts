import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";

export const TENANT_ID_KEY = "tenantId";
export const USER_ID_KEY = "userId";
export const USER_ROLE_KEY = "userRole";

/**
 * Reading this when nothing was set means code ran outside an authenticated
 * request. Throwing is right: the alternative is a query with no tenant filter.
 */
export class MissingTenantContextError extends Error {
  constructor(key: string) {
    super(
      `No ${key} in the current context. This code ran outside an authenticated request.`,
    );
    this.name = "MissingTenantContextError";
  }
}

/**
 * The only trusted source of the current tenant. Filled by the JWT guard from
 * token claims — never from a request body, query string, or header.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  get tenantId(): string {
    return this.require(TENANT_ID_KEY);
  }

  get userId(): string {
    return this.require(USER_ID_KEY);
  }

  get role(): string {
    return this.require(USER_ROLE_KEY);
  }

  private require(key: string): string {
    const value: unknown = this.cls.get(key);

    if (typeof value !== "string" || value === "") {
      throw new MissingTenantContextError(key);
    }

    return value;
  }
}
