import { ValueTransformer } from 'typeorm';

/**
 * TypeORM returns `numeric`/`decimal` Postgres columns as strings by
 * default (to avoid silent float precision loss on very large values) --
 * every money column in the billing domain applies this transformer so
 * entities/DTOs/API responses expose real JS numbers instead, matching
 * the shape the frontend and the spec's example quote JSON expect.
 * Amounts here are always small (INR pricing, at most a few hundred
 * thousand), so number-precision loss is not a practical concern.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null || value === undefined ? null : Number(value)),
};
