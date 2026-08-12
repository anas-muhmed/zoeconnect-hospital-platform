import { Controller, Post, Body, Patch, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Request() req: any,
  ) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  /**
   * POST /api/auth/forgot-password
   * Public. Returns a short-lived reset token shown directly on-screen
   * (no SMTP required — self-hosted portal).
   */
  @Public()
  @Post('forgot-password')
  forgotPassword(@Body('username') username: string) {
    return this.authService.forgotPassword(username ?? '');
  }

  /**
   * POST /api/auth/reset-password
   * Public. Validates raw token and sets a new password.
   */
  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
