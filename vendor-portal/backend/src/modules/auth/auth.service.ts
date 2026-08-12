import {
  Injectable, UnauthorizedException, BadRequestException, OnModuleInit, Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { VendorUser } from './entities/vendor-user.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(VendorUser) private readonly userRepo: Repository<VendorUser>,
    private readonly jwtService: JwtService,
  ) {}

  /** Seed default admin on first run if no users exist */
  async onModuleInit(): Promise<void> {
    // CRITICAL FIX (production incident, 2026-08): this used to read
    // `process.env.DEFAULT_ADMIN_PASSWORD ?? 'VendorAdmin@123'`. `??`
    // (nullish coalescing) only falls back for `null`/`undefined` -- an
    // env var that resolves to a DEFINED-BUT-EMPTY string (exactly what
    // Compose substitutes when `VENDOR_DEFAULT_ADMIN_PASSWORD` is unset in
    // `.env.production`, since `docker-compose.yml`'s
    // `DEFAULT_ADMIN_PASSWORD: ${VENDOR_DEFAULT_ADMIN_PASSWORD}` has no
    // `:-` default, unlike its sibling `CORS_ORIGIN` line right below it)
    // is `""`, which is NOT nullish -- so the fallback never fired and the
    // seed silently hashed an EMPTY password for the `admin` user.
    // CONFIRMED IN PRODUCTION: a real deployment's `admin` login rejected
    // every password typed (including the documented default) with
    // "Invalid credentials" -- exactly the symptom an empty-password hash
    // produces. `||` (falsy fallback) treats `""` the same as
    // unset/missing, which is the actually-intended behavior here.
    const rawPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'VendorAdmin@123';
    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
      this.logger.warn('VENDOR_DEFAULT_ADMIN_PASSWORD is unset or empty -- falling back to the well-known default admin password. Set it in .env.production and rotate the admin password immediately after first login.');
    }

    const count = await this.userRepo.count();
    if (count === 0) {
      const hash = await bcrypt.hash(rawPassword, 12);
      await this.userRepo.save(this.userRepo.create({
        username:     'admin',
        passwordHash: hash,
        role:         'ADMIN',
      }));
      this.logger.warn('Default admin user created — change password immediately');
      return;
    }

    // SELF-HEAL (production incident, 2026-08): the seed above is gated by
    // `count === 0` against `vendor_postgres_data`, a PERSISTENT named
    // volume (docker-compose.yml) -- a redeploy after the bug above had
    // already seeded a broken, empty-password `admin` row would silently
    // never re-run this block again, permanently locking out the operator
    // even after the env var and the `??`/`||` fix above are both
    // corrected. Detect exactly that specific, narrow corruption signature
    // -- a SINGLE existing user, username 'admin', whose stored hash
    // verifies against an EMPTY password -- and repair it in place. This
    // is deliberately narrow: it only ever fires for the one row this
    // exact historical bug could have produced, never for a real admin
    // who genuinely (if unwisely) has some other password already set.
    if (count === 1) {
      const existingAdmin = await this.userRepo.findOne({ where: { username: 'admin' } });
      if (existingAdmin && await bcrypt.compare('', existingAdmin.passwordHash)) {
        existingAdmin.passwordHash = await bcrypt.hash(rawPassword, 12);
        await this.userRepo.save(existingAdmin);
        this.logger.warn('Detected an "admin" user seeded with an empty password hash (known incident, 2026-08) -- repaired it with the configured default admin password. Change it immediately after login.');
      }
    }
  }

  async login(username: string, password: string): Promise<{ accessToken: string; user: Partial<VendorUser> }> {
    const user = await this.userRepo.findOne({ where: { username, isActive: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwtService.sign({
      sub:      user.id,
      username: user.username,
      role:     user.role,
    });

    return {
      accessToken,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  async validateToken(payload: { sub: string }): Promise<VendorUser | null> {
    return this.userRepo.findOne({ where: { id: payload.sub, isActive: true } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.save(user);
  }

  /**
   * Generates a one-hour reset token for the given username.
   * Returns the raw token — caller is responsible for surfacing it to the user
   * (shown on-screen since this is a self-hosted portal with no SMTP configured).
   * Always responds successfully even if username does not exist (prevents enumeration).
   */
  async forgotPassword(username: string): Promise<{ token: string }> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      // Return a fake token to prevent username enumeration
      return { token: crypto.randomBytes(32).toString('hex') };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = await bcrypt.hash(rawToken, 10);
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userRepo.save(user);

    this.logger.log(`Password reset token issued for user: ${username}`);
    return { token: rawToken };
  }

  /**
   * Validates the raw token and sets a new password.
   * Clears the token on success so it cannot be reused.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || !newPassword || newPassword.length < 8) {
      throw new BadRequestException('Token and a new password (min 8 chars) are required');
    }

    // Find users with a non-expired reset token
    const candidates = await this.userRepo
      .createQueryBuilder('u')
      .where('u.reset_token IS NOT NULL')
      .andWhere('u.reset_token_expires_at > NOW()')
      .getMany();

    let matched: typeof candidates[0] | undefined;
    for (const candidate of candidates) {
      if (candidate.resetToken && await bcrypt.compare(token, candidate.resetToken)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    matched.passwordHash = await bcrypt.hash(newPassword, 12);
    matched.resetToken = null;
    matched.resetTokenExpiresAt = null;
    await this.userRepo.save(matched);
    this.logger.log(`Password reset successful for user: ${matched.username}`);
  }
}
