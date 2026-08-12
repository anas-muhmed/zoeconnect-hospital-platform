import { registerAs } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  name: process.env.DB_NAME || 'hdsp_db',
  user: process.env.DB_USER || 'hdsp_app',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
  poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
  poolMax: parseInt(process.env.DB_POOL_MAX || '20', 10),
  logging: process.env.DB_LOGGING === 'true',
}));

// ── TypeORM async config for AppModule ───────────────────────────────────────
export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService): DataSourceOptions => ({
    type: 'postgres',
    host: config.get<string>('database.host'),
    port: config.get<number>('database.port'),
    database: config.get<string>('database.name'),
    username: config.get<string>('database.user'),
    password: config.get<string>('database.password'),
    ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
    entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
    migrations: [path.join(__dirname, '../database/migrations/*{.ts,.js}')],
    synchronize: false,          // NEVER true in production — use migrations
    logging: config.get<boolean>('database.logging'),
    poolSize: config.get<number>('database.poolMax'),
    extra: {
      min: config.get<number>('database.poolMin'),
      max: config.get<number>('database.poolMax'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    },
  }),
};

// ── TypeORM CLI DataSource (used by migration:generate / migration:run) ──────
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'hdsp_db',
  username: process.env.DB_USER || 'hdsp_app',
  password: process.env.DB_PASSWORD || '',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: [path.join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '../database/migrations/*{.ts,.js}')],
  migrationsTableName: 'typeorm_migrations',
});
