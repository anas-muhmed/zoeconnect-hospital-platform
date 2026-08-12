import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:      process.env.JWT_SECRET ?? 'vendor-jwt-secret-change-me',
      ignoreExpiration: false,
    });
  }

  async validate(payload: { sub: string; username: string; role: string }) {
    const user = await this.authService.validateToken(payload);
    if (!user) throw new UnauthorizedException('Token invalid or user deactivated');
    return user;
  }
}
