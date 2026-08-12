import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user: any = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Access denied');

    // Reservation-capability tokens (popup-window HIS integration) are not
    // a User entity and have no roles/permissions to check -- the
    // capability itself, scoped to one reservation, IS the authorization.
    // ReservationScopeGuard (applied alongside this guard on the three
    // routes these tokens can reach) enforces that scope; this guard has
    // nothing further to add for them.
    if (user.isCapabilityToken) return true;

    // Workstation session tokens (popup-window HIS integration, workstation-
    // based context) are likewise not a User entity and carry no
    // roles/permissions -- being a valid, unexpired token for a configured
    // workstation IS the authorization for the queue/reserve/heartbeat/
    // release/map routes it's used against. It cannot reach anything this
    // guard wasn't already going to allow: RegistrationController's
    // TOKEN:REGISTRATION:ACTION-guarded routes are exactly what a
    // workstation is meant to call on its own configured branch/location.
    if (user.isWorkstationToken) return true;

    if (user.isSuperAdmin) return true;

    const missing = required.filter((perm) => !user.hasPermission(perm));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Access denied. Missing permissions: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
