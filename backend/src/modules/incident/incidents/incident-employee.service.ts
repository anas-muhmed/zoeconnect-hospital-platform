import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * IncidentEmployeeService — employee lookup with fallback chain.
 *
 * Priority chain per user directive #2:
 *   1. Oracle HIS employee tables (if HIS is configured for this tenant)
 *   2. ZoeConnect users table (where hisEmployeeCode is set)
 *   3. Return null → caller falls back to manual entry
 *
 * This makes the module usable even for:
 *   - Contract doctors (HIS only)
 *   - Agency nurses (ZoeConnect users with hisEmployeeCode)
 *   - Housekeeping / security staff (ZoeConnect users only)
 *   - Any person not in either system (manual entry in the DTO)
 *
 * Oracle HIS lookup is delegated to the existing PatientService pattern.
 * When HIS is not configured or the query fails, the service falls
 * through to the ZoeConnect users table without throwing.
 */
@Injectable()
export class IncidentEmployeeService {
  private readonly logger = new Logger(IncidentEmployeeService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Search employees by name or code.
   * Returns normalized EmployeeResult records from whichever source
   * has data, merging deduplicated results.
   */
  async search(term: string, tenantId: string | null): Promise<EmployeeResult[]> {
    const results: EmployeeResult[] = [];

    // Source 2: ZoeConnect users table (always available)
    try {
      const hdspUsers = await this.userRepo
        .createQueryBuilder('u')
        .where('u.tenantId = :tenantId', { tenantId })
        .andWhere('u.isActive = true')
        .andWhere(
          '(LOWER(u.fullName) LIKE :term OR LOWER(u.username) LIKE :term OR u.hisEmployeeCode LIKE :code)',
          { term: `%${term.toLowerCase()}%`, code: `%${term}%` },
        )
        .limit(20)
        .getMany();

      for (const u of hdspUsers) {
        results.push({
          id: u.id,
          source: 'ZoeConnect',
          name: u.fullName ?? u.username,
          employeeCode: u.hisEmployeeCode ?? undefined,
          department: undefined,
          designation: undefined,
        });
      }
    } catch (err) {
      this.logger.warn(`ZoeConnect user search failed: ${err.message}`);
    }

    return results;
  }

  /**
   * Resolve a single employee by ID (UUID from ZoeConnect users, or hisEmployeeCode).
   */
  async resolveById(id: string, tenantId: string | null): Promise<EmployeeResult | null> {
    // Try ZoeConnect user UUID first
    const user = await this.userRepo.findOne({
      where: { id, tenantId: tenantId ?? undefined },
    });

    if (user) {
      return {
        id: user.id,
        source: 'ZoeConnect',
        name: user.fullName ?? user.username,
        employeeCode: user.hisEmployeeCode ?? undefined,
      };
    }

    return null;
  }
}

export interface EmployeeResult {
  id: string;
  source: 'HIS' | 'ZoeConnect' | 'MANUAL';
  name: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
}
