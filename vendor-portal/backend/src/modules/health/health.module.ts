import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { HealthController } from './health.controller';
import { MailHealthIndicator } from './mail.health';

@Module({
  // Bare `TypeOrmModule` (no forRoot/forFeature args) -- wires this
  // module's `@InjectDataSource()` to the DataSource already configured
  // by AppModule's `TypeOrmModule.forRoot(...)`, without re-declaring the
  // connection. Standard Nest pattern for a module that only needs the
  // DataSource itself, not any entity repositories.
  imports: [TerminusModule, TypeOrmModule, MailModule],
  controllers: [HealthController],
  providers: [MailHealthIndicator],
})
export class HealthModule {}
