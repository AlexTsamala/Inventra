import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "identity:isPublic";

/**
 * Marks a route as reachable without a token. The guard is global, so an
 * endpoint is protected unless it says otherwise — forgetting this decorator
 * locks a route down, it never opens one up.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
