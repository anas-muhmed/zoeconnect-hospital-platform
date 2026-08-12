-- ─────────────────────────────────────────────────────────────────────────────
-- HDSP PostgreSQL Initialisation Script
-- Runs ONCE on first container start (docker-entrypoint-initdb.d)
-- Sets up extensions, schema, and performance tuning.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- GiST indexes on scalar types

-- Create application schema (optional namespace separation)
-- All tables in public schema by default; change here if desired
-- CREATE SCHEMA IF NOT EXISTS platform;
-- CREATE SCHEMA IF NOT EXISTS loyalty;

-- ── Performance tuning (these are session-level; set in postgresql.conf for permanent) ──
-- Uncomment and adjust in postgresql.conf based on server RAM:
--
-- shared_buffers = 256MB          -- 25% of RAM
-- effective_cache_size = 768MB    -- 75% of RAM
-- work_mem = 16MB
-- maintenance_work_mem = 128MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100
-- random_page_cost = 1.1          -- For SSD storage
-- effective_io_concurrency = 200  -- For SSD storage
-- min_wal_size = 1GB
-- max_wal_size = 4GB
-- max_worker_processes = 4
-- max_parallel_workers_per_gather = 2
-- max_parallel_workers = 4

-- Grant privileges (app user already created by POSTGRES_USER env var)
GRANT ALL PRIVILEGES ON DATABASE hdsp_db TO hdsp_app;
GRANT ALL ON SCHEMA public TO hdsp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hdsp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hdsp_app;
