import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DEFAULT_BRANCH_ID } from '../../modules/branch/branch.service';

/**
 * @ActiveBranchId() — injects the currently selected branch ID from the JWT.
 *
 * Falls back to DEFAULT_BRANCH_ID ('2') when no branch has been selected yet.
 *
 * Usage:
 *   getLocations(@ActiveBranchId() branchId: string) { ... }
 */
export const ActiveBranchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    // The raw JWT payload is decoded by Fastify; extract it from the auth header
    try {
      const authHeader: string = request.headers?.authorization ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) return DEFAULT_BRANCH_ID;
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      return payload?.activeBranchId ?? DEFAULT_BRANCH_ID;
    } catch {
      return DEFAULT_BRANCH_ID;
    }
  },
);
