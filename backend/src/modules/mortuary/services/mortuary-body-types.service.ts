import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuaryBodyType } from '../entities/mortuary-body-type.entity';

/**
 * Mortuary integration (Phase 2, Stage C). Ports `getBodyTypes`.
 *
 * GLOBAL reference data (verified Stage B: `body_types` never received
 * `hospital_id` in the source). Uses the plain TypeORM repository directly
 * — no `TenantScopedRepository`, per Step 4's explicit instruction not to
 * force tenant scoping on global reference data. The source has no
 * create/update/delete endpoint for body types either (only the seeded
 * MLC/Non-MLC rows from Stage B's data), so none is added here.
 */
@Injectable()
export class MortuaryBodyTypesService {
  constructor(
    @InjectRepository(MortuaryBodyType)
    private readonly bodyTypeRepo: Repository<MortuaryBodyType>,
  ) {}

  findAll(): Promise<MortuaryBodyType[]> {
    return this.bodyTypeRepo.find();
  }
}
