import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService }    from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy }    from './strategies/jwt.strategy';
import { VendorUser }     from './entities/vendor-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorUser]),
    PassportModule,
    JwtModule.register({
      secret:       process.env.JWT_SECRET ?? 'vendor-jwt-secret-change-me',
      signOptions:  { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy],
  exports:     [AuthService, JwtModule],
})
export class AuthModule {}
