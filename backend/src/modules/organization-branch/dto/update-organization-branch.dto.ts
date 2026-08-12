import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateOrganizationBranchDto } from './create-organization-branch.dto';

/**
 * `code` is intentionally omitted from updates -- it is the stable,
 * tenant-scoped identifier callers reference this branch by; changing it
 * post-creation is not supported in this phase (mirrors Tenant.code's own
 * "stable identifier" posture -- see tenant.entity.ts).
 */
export class UpdateOrganizationBranchDto extends PartialType(
  OmitType(CreateOrganizationBranchDto, ['code'] as const),
) {}
