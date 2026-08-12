# HDSP — Apply corrected Oracle sync SQL to PostgreSQL
# Run from PowerShell in D:\HDSP:
#   powershell -ExecutionPolicy Bypass -File update_his_sql.ps1

Write-Host "Applying corrected sync SQL to PostgreSQL..." -ForegroundColor Cyan

# Copy the SQL file into the postgres container and run it
docker cp "$PSScriptRoot\fix_sync_sql.sql" hdsp_postgres:/tmp/fix_sync_sql.sql
docker exec hdsp_postgres psql -U hdsp_user -d hdsp_db -f /tmp/fix_sync_sql.sql

Write-Host ""
Write-Host "Verifying update..." -ForegroundColor Cyan
docker exec hdsp_postgres psql -U hdsp_user -d hdsp_db -c "SELECT config_key, LEFT(config_value, 150) AS preview FROM his_schema_configs WHERE config_key = 'sql.billing.sync';"

Write-Host ""
Write-Host "Flushing Redis cache key..." -ForegroundColor Cyan
docker exec hdsp_redis redis-cli -a dev_redis_password DEL his:schema:config his:sync:bill_cursor

Write-Host ""
Write-Host "Done! Restart the backend now (Ctrl+C then npm run start:dev)." -ForegroundColor Green
Write-Host "Then click 'Import from HIS' on the loyalty page." -ForegroundColor Green
