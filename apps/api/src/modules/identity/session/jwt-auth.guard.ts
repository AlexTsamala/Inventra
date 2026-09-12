import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ClsService } from "nestjs-cls";

import { IS_PUBLIC_KEY } from "../../shared/public.decorator";
import {
  TENANT_ID_KEY,
  USER_ID_KEY,
  USER_ROLE_KEY,
} from "../../shared/tenant-context/tenant-context";
import type { AccessTokenClaims } from "../tokens/access-token";

const BEARER_PREFIX = "Bearer ";

interface RequestWithHeaders {
  readonly headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = this.bearerToken(request.headers.authorization);

    if (token === null) {
      throw new UnauthorizedException();
    }

    const claims = await this.verify(token);

    // The tenant id enters the system here and nowhere else.
    this.cls.set(TENANT_ID_KEY, claims.tid);
    this.cls.set(USER_ID_KEY, claims.sub);
    this.cls.set(USER_ROLE_KEY, claims.role);

    return true;
  }

  private bearerToken(header: string | string[] | undefined): string | null {
    if (typeof header !== "string" || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }

    const token = header.slice(BEARER_PREFIX.length).trim();

    return token === "" ? null : token;
  }

  /**
   * Any verification failure — bad signature, expired, malformed — is the same
   * 401 to the caller. The reason is not converted into detail an attacker
   * could use to probe the token format.
   */
  private async verify(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch (error) {
      throw new UnauthorizedException(undefined, { cause: error });
    }
  }
}
