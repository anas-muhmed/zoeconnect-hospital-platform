-- stamp-migrations.sql
-- Run ONCE against your PostgreSQL database when the schema already exists
-- but the migrations table is empty (i.e. you were using synchronize:true before).
-- This marks all pre-existing migrations as done so only new ones (Phase1) run.

INSERT INTO migrations (timestamp, name) VALUES
  (1700000001000, 'CreatePlatformSchema1700000001000'),
  (1700000002000, 'CreateLicensingSchema1700000002000'),
  (1700000003000, 'CreateAuditSchema1700000003000'),
  (1700000004000, 'CreateNotificationSchema1700000004000'),
  (1700000005000, 'CreateLoyaltySchema1700000005000'),
  (1700000006000, 'CreateNotificationV2Schema1700000006000'),
  (1700000007000, 'AddPhoneToLoyaltyAccounts1700000007000'),
  (1700000011000, 'CreateEICSchema1700000011000'),
  (1700000012000, 'EicTherapistIdToVarchar1700000012000'),
  (1700000013000, 'PreschoolEnhancements1700000013000'),
  (1700000014000, 'CreateTokenSchema1700000014000'),
  (1700000015000, 'AddTokenLocations1700000015000'),
  (1700000016000, 'UserRolesManyToMany1700000016000'),
  (1700000017000, 'CreateUserPermissions1700000017000'),
  (1700000018000, 'CreateTokenDisplayConfig1700000018000'),
  (1700000019000, 'CreateDisplayPages1700000019000'),
  (1700000020000, 'CreateAttendanceRealtimeSchema1700000020000'),
  (1751140000000, 'AddHisEmployeeMapping1751140000000'),
  (1700000021000, 'CreateUserBranches1700000021000'),
  (1700000022000, 'BranchIdDefaultToAlmas1700000022000'),
  (1751200000000, 'AddHisColumnsToTokenLocations1751200000000')
ON CONFLICT DO NOTHING;
