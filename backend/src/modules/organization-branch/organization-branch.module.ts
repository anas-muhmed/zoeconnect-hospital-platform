import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationBranch } from './entities/organization-branch.entity';
import { OrganizationBranchService } from './organization-branch.service';
import { OrganizationBranchController } from './organization-branch.controller';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 -- see
 * organization-branch.entity.ts's doc comment. Deliberately standalone and
 * NOT imported by/into BranchModule (the existing Oracle HIS branch flow) --
 * the two concepts are independent by design.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrganizationBranch])],
  controllers: [OrganizationBranchController],
  providers: [OrganizationBranchService],
  exports: [OrganizationBranchService],
})
export class OrganizationBranchModule {}
