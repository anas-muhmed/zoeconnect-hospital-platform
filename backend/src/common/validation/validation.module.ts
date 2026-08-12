import { Module } from '@nestjs/common';
import { AvailabilityCheckService } from './availability-check.service';

/**
 * Shared validation infrastructure module. Import this wherever a feature
 * module needs live "is this value already taken" checks (Users today;
 * Organization Management, Tenant Management, Client Management,
 * Registration, and Vendor Portal are all expected to import this same
 * module rather than reimplementing `AvailabilityCheckService`).
 */
@Module({
  providers: [AvailabilityCheckService],
  exports: [AvailabilityCheckService],
})
export class ValidationModule {}
