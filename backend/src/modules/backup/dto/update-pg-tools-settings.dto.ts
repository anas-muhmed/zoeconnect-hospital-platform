import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body for both PUT /backups/settings/pg-tools (save) and POST /backups/settings/pg-tools/test (test-unsaved). */
export class UpdatePgToolsSettingsDto {
  @ApiProperty({ example: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe', description: 'Full path to the pg_dump executable on the SERVER/host filesystem (not the admin\'s local machine).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  pgDumpPath: string;

  @ApiProperty({ example: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_restore.exe', description: 'Full path to the pg_restore executable on the SERVER/host filesystem (not the admin\'s local machine).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  pgRestorePath: string;

  /** Advanced-section override -- 'auto' (default, PgEngineService detects local vs Docker), or force 'local'/'docker'/'remote'/'bundled'. Only meaningful on PUT (save); ignored by the unsaved-test endpoint. */
  @ApiPropertyOptional({ example: 'auto', enum: ['auto', 'local', 'docker', 'remote', 'bundled'], description: "Execution mode override: 'auto' (default) lets PgEngineService detect local vs Docker; 'local'/'docker'/'remote'/'bundled' force that strategy. 'remote' uses the same local-binary mechanics as 'local' but is labeled distinctly for a remote-database-host deployment." })
  @IsOptional()
  @IsIn(['auto', 'local', 'docker', 'remote', 'bundled'])
  executionMode?: 'auto' | 'local' | 'docker' | 'remote' | 'bundled';

  /** Admin-set Docker container name override -- required (by PgEngineService, not by this DTO) when executionMode === 'docker'. */
  @ApiPropertyOptional({ example: 'my-postgres-container', description: 'Docker container name to run pg_dump/pg_restore/psql inside, via `docker exec`. Required when executionMode is "docker".' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dockerContainerName?: string;
}
