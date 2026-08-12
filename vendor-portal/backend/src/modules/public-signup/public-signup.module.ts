import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicSignupController } from './public-signup.controller';
import { PublicSignupService } from './public-signup.service';
import { SignupOtpService } from './signup-otp.service';
import { EmailOtpVerification } from './entities/email-otp-verification.entity';
import { CloudTenantsModule } from '../cloud-tenants/cloud-tenants.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailOtpVerification]),
    CloudTenantsModule, // exports CloudTenantsService -- reused as-is, see PublicSignupService's doc comment
    MailModule, // exports MailService -- SignupOtpService.requestOtp() sends the real OTP email through it
  ],
  controllers: [PublicSignupController],
  providers: [SignupOtpService, PublicSignupService],
})
export class PublicSignupModule {}
