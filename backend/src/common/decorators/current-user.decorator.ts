import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '../../modules/users/entities/user.entity';

/**
 * @CurrentUser() — injects the authenticated user into a controller method.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: User) { ... }
 *
 * The user object is set on the request by JwtStrategy.validate()
 * after the JwtAuthGuard successfully verifies the token.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
