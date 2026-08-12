import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';

/**
 * ReservationScopeGuard
 *
 * Applied (in addition to JwtAuthGuard + PermissionsGuard, which already
 * run at the controller level) to the three endpoints a
 * reservation-capability token is allowed to reach: heartbeat, release,
 * and map/patient. See strategies/jwt.strategy.ts for how that token
 * becomes `req.user` in the first place.
 *
 * For a normal, fully-authenticated receptionist (`req.user` is a real
 * User entity), this guard is a no-op -- it changes nothing about the
 * original, already-working authorization for that path.
 *
 * For a capability-token caller, it enforces the one thing PermissionsGuard
 * deliberately skips for them: that the tokenNumber (route param or body)
 * and reservationId (body) in THIS request match exactly what the token
 * was minted for. A capability token leaked or replayed against a
 * different reservation is rejected here, before the service layer is
 * ever reached.
 */
@Injectable()
export class ReservationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user?.isCapabilityToken) return true;

    const cap = user.capability as {
      tokenNumber: string;
      reservationId: string;
      branchId: string;
    };

    const requestTokenNumber: string | undefined =
      req.params?.tokenNumber ?? req.body?.tokenNumber;

    if (requestTokenNumber && requestTokenNumber !== cap.tokenNumber) {
      throw new ForbiddenException(
        'This reservation session cannot act on a different token.',
      );
    }

    const requestReservationId: string | undefined = req.body?.reservationId;

    // Required for capability-authenticated callers even where the DTO
    // marks it optional for backward compatibility with the normal,
    // fully-authenticated receptionist path (see MapPatientDto) -- a
    // capability token has no other ownership check available, so this is
    // the only thing standing between it and mapping/heartbeating/
    // releasing a reservation it wasn't minted for.
    if (!requestReservationId) {
      throw new ForbiddenException(
        'reservationId is required when authenticated with a reservation session token.',
      );
    }

    if (requestReservationId !== cap.reservationId) {
      throw new ForbiddenException(
        'This reservation session cannot act on a different reservation.',
      );
    }

    return true;
  }
}
