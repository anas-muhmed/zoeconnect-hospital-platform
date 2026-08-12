import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AccountLockManagementService } from './account-lock-management.service';
import { PasswordResetService } from '../../auth/password-reset.service';
import { FeatureFlagsService } from '../../platform/feature-flags/feature-flags.service';

/** See childrens-village/adr/0002-vendor-portal-adapter-selection.md — this
 * is the feature key `CVStudentProviderManager` reads to decide whether to
 * inject `InternalStudentProvider` (standalone) or `OracleHisStudentProvider`
 * (HIS-integrated) for this tenant. */
const CV_STUDENT_PROVIDER_FLAG = 'cv.student.provider.internal';

export interface CommandPayload {
  action: string;
  targetId?: string;
  vendorContext: {
    correlationId: string;
    instanceId: string;
  };
  payload: Record<string, any>;
}

export interface CommandResult {
  commandId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  message?: string;
  result?: any;
}

@Injectable()
export class CommandDispatcherService {
  private readonly logger = new Logger(CommandDispatcherService.name);

  constructor(
    private readonly accountLockService: AccountLockManagementService,
    private readonly passwordResetService: PasswordResetService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async dispatch(command: CommandPayload): Promise<CommandResult> {
    this.logger.log(`Dispatching command [${command.action}] correlationId=${command.vendorContext.correlationId}`);
    
    try {
      // In a real CQRS system, this would use the NestJS CQRS CommandBus.
      // For this implementation, we route it directly to the handler services.
      let result;

      switch (command.action) {
        case 'security:users:create':
          result = await this.accountLockService.createUser(
            command.payload as any,
            command.vendorContext
          );
          break;
        case 'security:users:unlock':
          if (!command.targetId) throw new BadRequestException('targetId (userId) is required');
          result = await this.accountLockService.unlockUser(
            command.targetId,
            command.payload as { terminateSessions?: string, forcePasswordChange?: boolean, notifyUser?: boolean, reason: string },
            command.vendorContext
          );
          break;
        case 'security:users:reset-attempts':
          if (!command.targetId) throw new BadRequestException('targetId (userId) is required');
          result = await this.accountLockService.resetAttempts(
            command.targetId,
            command.payload as { reason: string },
            command.vendorContext
          );
          break;
        case 'security:users:reset-password':
          if (!command.targetId) throw new BadRequestException('targetId (userId) is required');
          if (!command.payload?.vendorRequestId) throw new BadRequestException('vendorRequestId is required');
          result = await this.passwordResetService.applyRemoteReset(
            command.targetId,
            command.payload.vendorRequestId as string,
            command.vendorContext
          );
          break;
        case 'modules:childrens-village:set-provider': {
          const mode = command.payload?.mode;
          if (mode !== 'internal' && mode !== 'oracle_his') {
            throw new BadRequestException(`payload.mode must be 'internal' or 'oracle_his', got: ${mode}`);
          }
          // Self-hosted instances have no ambient tenant context on a vendor
          // command (see AccountLockManagementService.createUser()'s doc
          // comment for the same gap) -- but that's fine here, unlike user
          // creation: setting the platform-wide default (tenantId: null) IS
          // the correct, sufficient scope for a single-tenant self-hosted
          // install, since FeatureFlagsService.resolveFromDb() falls through
          // to the global row whenever no tenant-specific override exists,
          // which is always the case here.
          const saved = await this.featureFlagsService.setFlag({
            tenantId: null,
            featureKey: CV_STUDENT_PROVIDER_FLAG,
            state: mode === 'internal' ? 'enabled' : 'disabled',
            description: "Children's Village student data source (standalone internal DB vs Oracle HIS-integrated), set via Vendor Portal",
            updatedBy: 'VENDOR_PORTAL',
          });
          result = { mode, state: saved.state };
          break;
        }
        default:
          throw new BadRequestException(`Unknown command action: ${command.action}`);
      }

      return {
        commandId: command.vendorContext.correlationId,
        status: 'COMPLETED',
        message: 'Command executed successfully',
        result,
      };
    } catch (error: any) {
      this.logger.error(`Command [${command.action}] failed: ${error.message}`);
      return {
        commandId: command.vendorContext.correlationId,
        status: 'FAILED',
        message: error.message,
      };
    }
  }
}
