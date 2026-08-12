import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { VendorSyncService } from '../licensing/vendor-sync.service';
import { RegisterHospitalDto } from '../licensing/dto/register-hospital.dto';
import { AuditService } from '../audit/audit.service';
import { Request } from 'express';
import { Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  private readonly logger = new Logger(SetupController.name);

  // Fix (cross-tenant leak): both routes below are @Public() (pre-login,
  // no JWT, so TenantContextInterceptor never runs) but still need to
  // scope VendorRegistration lookups by tenant. SubdomainTenantMiddleware
  // already resolves req.tenantId from the Host header on every request,
  // authenticated or not (same precedent AuthController.login()/
  // HisController use) -- wrapping the vendor-sync calls in
  // TenantContextStorage.run(req.tenantId, ...) (a static method, no DI
  // needed) lets them reuse the already-tenant-scoped
  // getRegistrationForCurrentTenant()/register() methods instead of the
  // deliberately-global getRegistration().
  constructor(
    private readonly vendorSyncService: VendorSyncService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Post('vendor-registration')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour per IP
  @ApiOperation({
    summary: 'One-time emergency bootstrap endpoint to register ZoeConnect with vendor platform.',
    description: 'This endpoint will only succeed if the instance has never been registered.',
  })
  @ApiResponse({ status: 201, description: 'Vendor registration successful' })
  @ApiResponse({ status: 403, description: 'Instance is already registered with a vendor' })
  async setupVendorRegistration(
    @Body() dto: RegisterHospitalDto,
    @Req() req: FastifyRequest & { tenantId?: string },
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const userAgent = (req.headers['user-agent'] as string) || '';
    const tenantId = req.tenantId;

    await this.auditService.log({
      action: 'INSTANCE_REGISTRATION_STARTED',
      module: 'PLATFORM',
      entityType: 'vendor_registration',
      ipAddress,
      userAgent,
      metadata: { dto },
    });

    // Fix (cross-tenant leak): removed the redundant, globally-scoped
    // `getRegistration()` pre-check that used to sit here -- it would
    // block registration for EVERY tenant the moment ANY tenant anywhere
    // had a registration row, since it ignored tenant entirely.
    // `vendorSyncService.register(dto)` below already performs its own
    // tenant-scoped existence check (getRegistrationForCurrentTenant())
    // and throws ConflictException -- caught below and translated to the
    // same 403 INSTANCE_ALREADY_REGISTERED shape this endpoint always
    // returned, so the API contract is unchanged for any existing caller.
    try {
      this.logger.log('Starting one-time vendor registration bootstrap...');
      const reg = tenantId
        ? await TenantContextStorage.run(tenantId, () => this.vendorSyncService.register(dto))
        : await this.vendorSyncService.register(dto);

      await this.auditService.log({
        action: 'INSTANCE_REGISTERED',
        module: 'PLATFORM',
        entityId: reg.instanceToken,
        entityType: 'vendor_registration',
        ipAddress,
        userAgent,
        metadata: { vendorApiUrl: reg.vendorApiUrl },
      });

      this.logger.log('Successfully bootstrapped vendor registration');
      return {
        registered: true,
        status: reg.status,
        instanceToken: reg.instanceToken,
        registeredAt: reg.registeredAt,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn('Attempted to call one-time vendor registration on an already registered instance');
        await this.auditService.log({
          action: 'INSTANCE_ALREADY_REGISTERED',
          module: 'PLATFORM',
          entityType: 'vendor_registration',
          ipAddress,
          userAgent,
          metadata: { reason: (error as Error).message },
        });
        throw new ForbiddenException('INSTANCE_ALREADY_REGISTERED');
      }
      this.logger.error(`Bootstrap registration failed: ${(error as Error).message}`);
      await this.auditService.log({
        action: 'INSTANCE_REGISTRATION_FAILED',
        module: 'PLATFORM',
        entityType: 'vendor_registration',
        ipAddress,
        userAgent,
        metadata: { error: (error as Error).message },
      });
      throw error;
    }
  }

  @Public()
  @Get('vendor-registration/status')
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 requests per minute
  @ApiOperation({
    summary: 'Check if the ZoeConnect instance is registered with a vendor.',
  })
  async getVendorRegistrationStatus(@Req() req: FastifyRequest & { tenantId?: string }) {
    // Fix (cross-tenant leak): this used to call the deliberately-global
    // getRegistration() directly, so every tenant's public login page
    // showed whichever registration row happened to be first in the
    // table -- one tenant's hospital name/registration status leaking
    // into every other tenant's login screen. req.tenantId is resolved by
    // SubdomainTenantMiddleware from the Host header on every request
    // (this route is @Public(), so there's no JWT/TenantContextInterceptor
    // to derive it from otherwise). Self-hosted: req.tenantId always
    // resolves to the single 'default' tenant, so this returns exactly
    // the same (only) registration row the old unscoped call did -- zero
    // behavior change there.
    const tenantId = req.tenantId;
    const existing = tenantId
      ? await TenantContextStorage.run(tenantId, () => this.vendorSyncService.getRegistrationForCurrentTenant())
      : await this.vendorSyncService.getRegistration();
    if (!existing) {
      return { registered: false };
    }
    return {
      registered: true,
      hospitalName: existing.hospitalName || 'Unknown Hospital',
      registeredAt: existing.registeredAt,
      vendorName: 'ZoeConnect Vendor Platform', // Assuming a static name or if we have a vendorName in DB.
    };
  }
}
