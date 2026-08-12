# Diff Details

Date : 2026-07-16 13:32:20

Directory d:\\HDSP_HYBRID\\backend

Total : 890 files,  1308 codes, 9850 comments, 6247 blanks, all 17405 lines

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [backend/main.js](/backend/main.js) | JavaScript | 111 | 1 | 0 | 112 |
| [backend/nest-cli.json](/backend/nest-cli.json) | JSON | 9 | 0 | 1 | 10 |
| [backend/package-lock.json](/backend/package-lock.json) | JSON | 13,155 | 0 | 1 | 13,156 |
| [backend/package.json](/backend/package.json) | JSON | 137 | 0 | 1 | 138 |
| [backend/src/app.controller.ts](/backend/src/app.controller.ts) | TypeScript | 67 | 0 | 6 | 73 |
| [backend/src/app.module.ts](/backend/src/app.module.ts) | TypeScript | 116 | 63 | 28 | 207 |
| [backend/src/common/decorators/active-branch.decorator.ts](/backend/src/common/decorators/active-branch.decorator.ts) | TypeScript | 18 | 9 | 2 | 29 |
| [backend/src/common/decorators/audit.decorator.ts](/backend/src/common/decorators/audit.decorator.ts) | TypeScript | 8 | 8 | 4 | 20 |
| [backend/src/common/decorators/current-user.decorator.ts](/backend/src/common/decorators/current-user.decorator.ts) | TypeScript | 8 | 10 | 2 | 20 |
| [backend/src/common/decorators/permissions.decorator.ts](/backend/src/common/decorators/permissions.decorator.ts) | TypeScript | 4 | 9 | 3 | 16 |
| [backend/src/common/decorators/public.decorator.ts](/backend/src/common/decorators/public.decorator.ts) | TypeScript | 3 | 9 | 3 | 15 |
| [backend/src/common/decorators/roles.decorator.ts](/backend/src/common/decorators/roles.decorator.ts) | TypeScript | 3 | 8 | 3 | 14 |
| [backend/src/common/filters/global-exception.filter.ts](/backend/src/common/filters/global-exception.filter.ts) | TypeScript | 69 | 7 | 12 | 88 |
| [backend/src/common/guards/jwt-auth.guard.ts](/backend/src/common/guards/jwt-auth.guard.ts) | TypeScript | 26 | 6 | 5 | 37 |
| [backend/src/common/guards/permissions.guard.ts](/backend/src/common/guards/permissions.guard.ts) | TypeScript | 29 | 14 | 9 | 52 |
| [backend/src/common/guards/reservation-scope.guard.ts](/backend/src/common/guards/reservation-scope.guard.ts) | TypeScript | 35 | 26 | 10 | 71 |
| [backend/src/common/guards/roles.guard.ts](/backend/src/common/guards/roles.guard.ts) | TypeScript | 29 | 0 | 7 | 36 |
| [backend/src/common/guards/tenant-scope.guard.ts](/backend/src/common/guards/tenant-scope.guard.ts) | TypeScript | 53 | 49 | 11 | 113 |
| [backend/src/common/health/bull.health.ts](/backend/src/common/health/bull.health.ts) | TypeScript | 31 | 6 | 3 | 40 |
| [backend/src/common/health/oracle.health.ts](/backend/src/common/health/oracle.health.ts) | TypeScript | 34 | 8 | 7 | 49 |
| [backend/src/common/health/redis.health.ts](/backend/src/common/health/redis.health.ts) | TypeScript | 38 | 0 | 4 | 42 |
| [backend/src/common/interceptors/audit.interceptor.ts](/backend/src/common/interceptors/audit.interceptor.ts) | TypeScript | 33 | 11 | 7 | 51 |
| [backend/src/common/interceptors/logging.interceptor.ts](/backend/src/common/interceptors/logging.interceptor.ts) | TypeScript | 45 | 4 | 4 | 53 |
| [backend/src/common/middleware/request-id.middleware.ts](/backend/src/common/middleware/request-id.middleware.ts) | TypeScript | 12 | 4 | 2 | 18 |
| [backend/src/common/middleware/subdomain-tenant.middleware.ts](/backend/src/common/middleware/subdomain-tenant.middleware.ts) | TypeScript | 33 | 34 | 6 | 73 |
| [backend/src/common/redis/redis.provider.ts](/backend/src/common/redis/redis.provider.ts) | TypeScript | 26 | 1 | 6 | 33 |
| [backend/src/common/utils/logger.util.ts](/backend/src/common/utils/logger.util.ts) | TypeScript | 67 | 18 | 12 | 97 |
| [backend/src/config/app.config.ts](/backend/src/config/app.config.ts) | TypeScript | 14 | 22 | 2 | 38 |
| [backend/src/config/database.config.ts](/backend/src/config/database.config.ts) | TypeScript | 52 | 2 | 4 | 58 |
| [backend/src/config/deployment.config.ts](/backend/src/config/deployment.config.ts) | TypeScript | 4 | 9 | 2 | 15 |
| [backend/src/config/env.validation.ts](/backend/src/config/env.validation.ts) | TypeScript | 82 | 70 | 18 | 170 |
| [backend/src/config/jwt.config.ts](/backend/src/config/jwt.config.ts) | TypeScript | 7 | 0 | 2 | 9 |
| [backend/src/config/oracle.config.ts](/backend/src/config/oracle.config.ts) | TypeScript | 26 | 2 | 2 | 30 |
| [backend/src/config/redis.config.ts](/backend/src/config/redis.config.ts) | TypeScript | 55 | 14 | 6 | 75 |
| [backend/src/database/data-source.ts](/backend/src/database/data-source.ts) | TypeScript | 196 | 4 | 9 | 209 |
| [backend/src/database/migrations/1700000001-CreatePlatformSchema.ts](/backend/src/database/migrations/1700000001-CreatePlatformSchema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000001000-CreatePlatformSchema.ts](/backend/src/database/migrations/1700000001000-CreatePlatformSchema.ts) | TypeScript | 107 | 13 | 11 | 131 |
| [backend/src/database/migrations/1700000002-CreateLicensingSchema.ts](/backend/src/database/migrations/1700000002-CreateLicensingSchema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000002000-CreateLicensingSchema.ts](/backend/src/database/migrations/1700000002000-CreateLicensingSchema.ts) | TypeScript | 33 | 5 | 5 | 43 |
| [backend/src/database/migrations/1700000003-CreateAuditSchema.ts](/backend/src/database/migrations/1700000003-CreateAuditSchema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000003000-CreateAuditSchema.ts](/backend/src/database/migrations/1700000003000-CreateAuditSchema.ts) | TypeScript | 55 | 12 | 6 | 73 |
| [backend/src/database/migrations/1700000004-CreateNotificationSchema.ts](/backend/src/database/migrations/1700000004-CreateNotificationSchema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000004000-CreateNotificationSchema.ts](/backend/src/database/migrations/1700000004000-CreateNotificationSchema.ts) | TypeScript | 52 | 7 | 6 | 65 |
| [backend/src/database/migrations/1700000005-CreateLoyaltySchema.ts](/backend/src/database/migrations/1700000005-CreateLoyaltySchema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000005000-CreateLoyaltySchema.ts](/backend/src/database/migrations/1700000005000-CreateLoyaltySchema.ts) | TypeScript | 184 | 16 | 12 | 212 |
| [backend/src/database/migrations/1700000006-CreateNotificationV2Schema.ts](/backend/src/database/migrations/1700000006-CreateNotificationV2Schema.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000006000-CreateNotificationV2Schema.ts](/backend/src/database/migrations/1700000006000-CreateNotificationV2Schema.ts) | TypeScript | 106 | 13 | 8 | 127 |
| [backend/src/database/migrations/1700000007-AddPhoneToLoyaltyAccounts.ts](/backend/src/database/migrations/1700000007-AddPhoneToLoyaltyAccounts.ts) | TypeScript | 0 | 1 | 1 | 2 |
| [backend/src/database/migrations/1700000007000-AddPhoneToLoyaltyAccounts.ts](/backend/src/database/migrations/1700000007000-AddPhoneToLoyaltyAccounts.ts) | TypeScript | 27 | 8 | 5 | 40 |
| [backend/src/database/migrations/1700000008000-CreateVendorSyncSchema.ts](/backend/src/database/migrations/1700000008000-CreateVendorSyncSchema.ts) | TypeScript | 47 | 6 | 6 | 59 |
| [backend/src/database/migrations/1700000009000-MakeSystemColumnsNullable.ts](/backend/src/database/migrations/1700000009000-MakeSystemColumnsNullable.ts) | TypeScript | 24 | 24 | 5 | 53 |
| [backend/src/database/migrations/1700000010000-CreateHisSchemaConfig.ts](/backend/src/database/migrations/1700000010000-CreateHisSchemaConfig.ts) | TypeScript | 153 | 44 | 18 | 215 |
| [backend/src/database/migrations/1700000011000-CreateEICSchema.ts](/backend/src/database/migrations/1700000011000-CreateEICSchema.ts) | TypeScript | 465 | 40 | 30 | 535 |
| [backend/src/database/migrations/1700000012000-EicTherapistIdToVarchar.ts](/backend/src/database/migrations/1700000012000-EicTherapistIdToVarchar.ts) | TypeScript | 48 | 6 | 4 | 58 |
| [backend/src/database/migrations/1700000013000-PreschoolEnhancements.ts](/backend/src/database/migrations/1700000013000-PreschoolEnhancements.ts) | TypeScript | 59 | 16 | 9 | 84 |
| [backend/src/database/migrations/1700000014000-CreateTokenSchema.ts](/backend/src/database/migrations/1700000014000-CreateTokenSchema.ts) | TypeScript | 89 | 13 | 12 | 114 |
| [backend/src/database/migrations/1700000014000-GoalExtension.ts](/backend/src/database/migrations/1700000014000-GoalExtension.ts) | TypeScript | 6 | 1 | 1 | 8 |
| [backend/src/database/migrations/1700000015000-AddTokenLocations.ts](/backend/src/database/migrations/1700000015000-AddTokenLocations.ts) | TypeScript | 82 | 20 | 13 | 115 |
| [backend/src/database/migrations/1700000016000-UserRolesManyToMany.ts](/backend/src/database/migrations/1700000016000-UserRolesManyToMany.ts) | TypeScript | 48 | 5 | 9 | 62 |
| [backend/src/database/migrations/1700000017000-CreateUserPermissions.ts](/backend/src/database/migrations/1700000017000-CreateUserPermissions.ts) | TypeScript | 21 | 8 | 5 | 34 |
| [backend/src/database/migrations/1700000018000-CreateTokenDisplayConfig.ts](/backend/src/database/migrations/1700000018000-CreateTokenDisplayConfig.ts) | TypeScript | 23 | 9 | 5 | 37 |
| [backend/src/database/migrations/1700000019000-CreateDisplayPages.ts](/backend/src/database/migrations/1700000019000-CreateDisplayPages.ts) | TypeScript | 23 | 6 | 4 | 33 |
| [backend/src/database/migrations/1700000020000-CreateAttendanceRealtimeSchema.ts](/backend/src/database/migrations/1700000020000-CreateAttendanceRealtimeSchema.ts) | TypeScript | 122 | 0 | 11 | 133 |
| [backend/src/database/migrations/1700000021000-CreateUserBranches.ts](/backend/src/database/migrations/1700000021000-CreateUserBranches.ts) | TypeScript | 50 | 0 | 12 | 62 |
| [backend/src/database/migrations/1700000022000-BranchIdDefaultToAlmas.ts](/backend/src/database/migrations/1700000022000-BranchIdDefaultToAlmas.ts) | TypeScript | 22 | 10 | 6 | 38 |
| [backend/src/database/migrations/1751140000000-AddHisEmployeeMapping.ts](/backend/src/database/migrations/1751140000000-AddHisEmployeeMapping.ts) | TypeScript | 17 | 0 | 2 | 19 |
| [backend/src/database/migrations/1751200000000-AddHisColumnsToTokenLocations.ts](/backend/src/database/migrations/1751200000000-AddHisColumnsToTokenLocations.ts) | TypeScript | 30 | 9 | 5 | 44 |
| [backend/src/database/migrations/1751300000000-TokenArchitecturePhase1.ts](/backend/src/database/migrations/1751300000000-TokenArchitecturePhase1.ts) | TypeScript | 298 | 27 | 20 | 345 |
| [backend/src/database/migrations/1751400000001-AddTokenPrefixToLocations.ts](/backend/src/database/migrations/1751400000001-AddTokenPrefixToLocations.ts) | TypeScript | 16 | 9 | 4 | 29 |
| [backend/src/database/migrations/1751400000002-AddResetToAuditLogAction.ts](/backend/src/database/migrations/1751400000002-AddResetToAuditLogAction.ts) | TypeScript | 23 | 4 | 3 | 30 |
| [backend/src/database/migrations/1751400000002-ExpandTokenCallsSchema.ts](/backend/src/database/migrations/1751400000002-ExpandTokenCallsSchema.ts) | TypeScript | 47 | 23 | 8 | 78 |
| [backend/src/database/migrations/1751400000003-ExpandTokenCallsSchema.ts](/backend/src/database/migrations/1751400000003-ExpandTokenCallsSchema.ts) | TypeScript | 47 | 24 | 8 | 79 |
| [backend/src/database/migrations/1751400000004-GoalExtension.ts](/backend/src/database/migrations/1751400000004-GoalExtension.ts) | TypeScript | 24 | 0 | 4 | 28 |
| [backend/src/database/migrations/1751400000005-AddDisciplineAssignments.ts](/backend/src/database/migrations/1751400000005-AddDisciplineAssignments.ts) | TypeScript | 61 | 6 | 8 | 75 |
| [backend/src/database/migrations/1751500000001-CreateAttendanceDependencyEvents.ts](/backend/src/database/migrations/1751500000001-CreateAttendanceDependencyEvents.ts) | TypeScript | 43 | 12 | 8 | 63 |
| [backend/src/database/migrations/1751600000001-AddScopeToAttendanceDependencyEvents.ts](/backend/src/database/migrations/1751600000001-AddScopeToAttendanceDependencyEvents.ts) | TypeScript | 26 | 12 | 5 | 43 |
| [backend/src/database/migrations/1751600000002-CreateAttendanceDependencySnapshot.ts](/backend/src/database/migrations/1751600000002-CreateAttendanceDependencySnapshot.ts) | TypeScript | 33 | 0 | 6 | 39 |
| [backend/src/database/migrations/1751600000003-CreateAttendanceDivergenceLog.ts](/backend/src/database/migrations/1751600000003-CreateAttendanceDivergenceLog.ts) | TypeScript | 35 | 0 | 7 | 42 |
| [backend/src/database/migrations/1751700000001-CreateAttendanceGovernanceLocks.ts](/backend/src/database/migrations/1751700000001-CreateAttendanceGovernanceLocks.ts) | TypeScript | 43 | 0 | 5 | 48 |
| [backend/src/database/migrations/1751700000002-CreateAttendanceSkipLog.ts](/backend/src/database/migrations/1751700000002-CreateAttendanceSkipLog.ts) | TypeScript | 39 | 0 | 5 | 44 |
| [backend/src/database/migrations/1751800000001-AddRegistrationColumnsToTokenRecords.ts](/backend/src/database/migrations/1751800000001-AddRegistrationColumnsToTokenRecords.ts) | TypeScript | 63 | 30 | 11 | 104 |
| [backend/src/database/migrations/1751800000002-CreateRegistrationMappingSchema.ts](/backend/src/database/migrations/1751800000002-CreateRegistrationMappingSchema.ts) | TypeScript | 217 | 45 | 26 | 288 |
| [backend/src/database/migrations/1783251715976-CreateDocumentPlatformSchema.ts](/backend/src/database/migrations/1783251715976-CreateDocumentPlatformSchema.ts) | TypeScript | 123 | 18 | 10 | 151 |
| [backend/src/database/migrations/1783276251575-AddAssetEntity.ts](/backend/src/database/migrations/1783276251575-AddAssetEntity.ts) | TypeScript | 10 | 0 | 4 | 14 |
| [backend/src/database/migrations/1783300000000-CreateImportJobsTable.ts](/backend/src/database/migrations/1783300000000-CreateImportJobsTable.ts) | TypeScript | 38 | 0 | 5 | 43 |
| [backend/src/database/migrations/1783326737784-ConsolidateRecentChanges.ts](/backend/src/database/migrations/1783326737784-ConsolidateRecentChanges.ts) | TypeScript | 1,269 | 22 | 10 | 1,301 |
| [backend/src/database/migrations/1783338015788-AddRecoveryAccountFields.ts](/backend/src/database/migrations/1783338015788-AddRecoveryAccountFields.ts) | TypeScript | 12 | 0 | 4 | 16 |
| [backend/src/database/migrations/1783341110006-AddRecoveryAccountFields.ts](/backend/src/database/migrations/1783341110006-AddRecoveryAccountFields.ts) | TypeScript | 12 | 0 | 4 | 16 |
| [backend/src/database/migrations/1783400000000-CreatePasswordResetRequestsTable.ts](/backend/src/database/migrations/1783400000000-CreatePasswordResetRequestsTable.ts) | TypeScript | 72 | 0 | 10 | 82 |
| [backend/src/database/migrations/1783405488684-CreateSystemSettings.ts](/backend/src/database/migrations/1783405488684-CreateSystemSettings.ts) | TypeScript | 10 | 0 | 4 | 14 |
| [backend/src/database/migrations/1783420000000-AddTokenConfigReadPermission.ts](/backend/src/database/migrations/1783420000000-AddTokenConfigReadPermission.ts) | TypeScript | 43 | 32 | 5 | 80 |
| [backend/src/database/migrations/1783430000000-CreateWorkstationConfiguration.ts](/backend/src/database/migrations/1783430000000-CreateWorkstationConfiguration.ts) | TypeScript | 38 | 21 | 5 | 64 |
| [backend/src/database/migrations/1783440000000-EnsureTokenRecordsRegisteredAt.ts](/backend/src/database/migrations/1783440000000-EnsureTokenRecordsRegisteredAt.ts) | TypeScript | 19 | 14 | 4 | 37 |
| [backend/src/database/migrations/1783450000000-EnsureTokenRecordsRegistrationColumns.ts](/backend/src/database/migrations/1783450000000-EnsureTokenRecordsRegistrationColumns.ts) | TypeScript | 20 | 16 | 4 | 40 |
| [backend/src/database/migrations/1783460000000-EnsureTokenSequencesConstraints.ts](/backend/src/database/migrations/1783460000000-EnsureTokenSequencesConstraints.ts) | TypeScript | 24 | 15 | 5 | 44 |
| [backend/src/database/migrations/1783470000000-AddTokenRecordsReferenceIndexes.ts](/backend/src/database/migrations/1783470000000-AddTokenRecordsReferenceIndexes.ts) | TypeScript | 20 | 15 | 4 | 39 |
| [backend/src/database/migrations/1783480000000-AddRegistrationViewActionPermissions.ts](/backend/src/database/migrations/1783480000000-AddRegistrationViewActionPermissions.ts) | TypeScript | 95 | 34 | 14 | 143 |
| [backend/src/database/migrations/1783490000000-CreateCmsModule.ts](/backend/src/database/migrations/1783490000000-CreateCmsModule.ts) | TypeScript | 132 | 10 | 7 | 149 |
| [backend/src/database/migrations/1783500000000-CreateCmsScheduling.ts](/backend/src/database/migrations/1783500000000-CreateCmsScheduling.ts) | TypeScript | 31 | 6 | 4 | 41 |
| [backend/src/database/migrations/1783510000000-CmsHardening.ts](/backend/src/database/migrations/1783510000000-CmsHardening.ts) | TypeScript | 39 | 4 | 4 | 47 |
| [backend/src/database/migrations/1783520000000-CmsPlayerHealth.ts](/backend/src/database/migrations/1783520000000-CmsPlayerHealth.ts) | TypeScript | 30 | 6 | 4 | 40 |
| [backend/src/database/migrations/1783530000000-CmsV1Stabilization.ts](/backend/src/database/migrations/1783530000000-CmsV1Stabilization.ts) | TypeScript | 110 | 6 | 5 | 121 |
| [backend/src/database/migrations/1783540000000-CmsPluginConfig.ts](/backend/src/database/migrations/1783540000000-CmsPluginConfig.ts) | TypeScript | 22 | 9 | 4 | 35 |
| [backend/src/database/migrations/1783550000000-CreateCmsTicker.ts](/backend/src/database/migrations/1783550000000-CreateCmsTicker.ts) | TypeScript | 49 | 18 | 4 | 71 |
| [backend/src/database/migrations/1783560000000-CreateFeedbackModule.ts](/backend/src/database/migrations/1783560000000-CreateFeedbackModule.ts) | TypeScript | 131 | 22 | 5 | 158 |
| [backend/src/database/migrations/1783570000000-CreateFeedbackPhase2.ts](/backend/src/database/migrations/1783570000000-CreateFeedbackPhase2.ts) | TypeScript | 116 | 13 | 5 | 134 |
| [backend/src/database/migrations/1783580000000-AddFeedbackFormHeaderImage.ts](/backend/src/database/migrations/1783580000000-AddFeedbackFormHeaderImage.ts) | TypeScript | 18 | 9 | 4 | 31 |
| [backend/src/database/migrations/1783590000000-AddFeedbackAnswerDisplayValue.ts](/backend/src/database/migrations/1783590000000-AddFeedbackAnswerDisplayValue.ts) | TypeScript | 14 | 9 | 4 | 27 |
| [backend/src/database/migrations/1783600000000-AddFeedbackSubmissionCampaignDedupIndex.ts](/backend/src/database/migrations/1783600000000-AddFeedbackSubmissionCampaignDedupIndex.ts) | TypeScript | 16 | 10 | 4 | 30 |
| [backend/src/database/migrations/1783610000000-AddFeedbackFormSplashScreen.ts](/backend/src/database/migrations/1783610000000-AddFeedbackFormSplashScreen.ts) | TypeScript | 18 | 9 | 4 | 31 |
| [backend/src/database/migrations/1783620000000-AddFeedbackCampaignGoogleReview.ts](/backend/src/database/migrations/1783620000000-AddFeedbackCampaignGoogleReview.ts) | TypeScript | 24 | 13 | 4 | 41 |
| [backend/src/database/migrations/1783630000000-CreateFeedbackComplaints.ts](/backend/src/database/migrations/1783630000000-CreateFeedbackComplaints.ts) | TypeScript | 61 | 8 | 5 | 74 |
| [backend/src/database/migrations/1783640000000-AddFeedbackAnalyticsPermission.ts](/backend/src/database/migrations/1783640000000-AddFeedbackAnalyticsPermission.ts) | TypeScript | 31 | 7 | 4 | 42 |
| [backend/src/database/migrations/1783650000000-AddFeedbackReportPermission.ts](/backend/src/database/migrations/1783650000000-AddFeedbackReportPermission.ts) | TypeScript | 31 | 5 | 4 | 40 |
| [backend/src/database/migrations/1783660000000-CreateFeedbackLanguages.ts](/backend/src/database/migrations/1783660000000-CreateFeedbackLanguages.ts) | TypeScript | 65 | 14 | 5 | 84 |
| [backend/src/database/migrations/1783670000000-CreateFeedbackNotifications.ts](/backend/src/database/migrations/1783670000000-CreateFeedbackNotifications.ts) | TypeScript | 23 | 8 | 4 | 35 |
| [backend/src/database/migrations/1783680000000-MakeFeedbackAnswerValueNullable.ts](/backend/src/database/migrations/1783680000000-MakeFeedbackAnswerValueNullable.ts) | TypeScript | 15 | 12 | 4 | 31 |
| [backend/src/database/migrations/1783690000000-CreateFeedbackSettings.ts](/backend/src/database/migrations/1783690000000-CreateFeedbackSettings.ts) | TypeScript | 73 | 24 | 6 | 103 |
| [backend/src/database/migrations/1783700000000-CreateTenantTable.ts](/backend/src/database/migrations/1783700000000-CreateTenantTable.ts) | TypeScript | 28 | 8 | 4 | 40 |
| [backend/src/database/migrations/1783710000000-SeedDefaultTenant.ts](/backend/src/database/migrations/1783710000000-SeedDefaultTenant.ts) | TypeScript | 15 | 8 | 4 | 27 |
| [backend/src/database/migrations/1783720000000-AddTenantIdToSettingsTables.ts](/backend/src/database/migrations/1783720000000-AddTenantIdToSettingsTables.ts) | TypeScript | 25 | 15 | 6 | 46 |
| [backend/src/database/migrations/1783730000000-AddTenantIdToLicensingTables.ts](/backend/src/database/migrations/1783730000000-AddTenantIdToLicensingTables.ts) | TypeScript | 25 | 15 | 6 | 46 |
| [backend/src/database/migrations/1783740000000-AddTenantIdToAuthRbacTables.ts](/backend/src/database/migrations/1783740000000-AddTenantIdToAuthRbacTables.ts) | TypeScript | 25 | 20 | 6 | 51 |
| [backend/src/database/migrations/1783750000000-AddTenantIdToAuditNotificationTables.ts](/backend/src/database/migrations/1783750000000-AddTenantIdToAuditNotificationTables.ts) | TypeScript | 25 | 23 | 6 | 54 |
| [backend/src/database/migrations/1783760000000-AddTenantIdToLoyaltyTables.ts](/backend/src/database/migrations/1783760000000-AddTenantIdToLoyaltyTables.ts) | TypeScript | 39 | 33 | 6 | 78 |
| [backend/src/database/migrations/1783770000000-AddTenantIdToEicTables.ts](/backend/src/database/migrations/1783770000000-AddTenantIdToEicTables.ts) | TypeScript | 41 | 37 | 5 | 83 |
| [backend/src/database/migrations/1783780000000-AddTenantIdToAttendanceTables.ts](/backend/src/database/migrations/1783780000000-AddTenantIdToAttendanceTables.ts) | TypeScript | 33 | 40 | 5 | 78 |
| [backend/src/database/migrations/1783780000001-AddTenantIdToAttendanceDependencyEvents.ts](/backend/src/database/migrations/1783780000001-AddTenantIdToAttendanceDependencyEvents.ts) | TypeScript | 23 | 28 | 4 | 55 |
| [backend/src/database/migrations/1783790000000-AddTenantIdToCmsTables.ts](/backend/src/database/migrations/1783790000000-AddTenantIdToCmsTables.ts) | TypeScript | 37 | 41 | 5 | 83 |
| [backend/src/database/migrations/1783800000000-AddTenantIdToFeedbackTables.ts](/backend/src/database/migrations/1783800000000-AddTenantIdToFeedbackTables.ts) | TypeScript | 39 | 51 | 5 | 95 |
| [backend/src/database/migrations/1783810000000-AddTenantIdToTokenTables.ts](/backend/src/database/migrations/1783810000000-AddTenantIdToTokenTables.ts) | TypeScript | 42 | 67 | 5 | 114 |
| [backend/src/database/migrations/1783820000000-BackfillDefaultRolePermissions.ts](/backend/src/database/migrations/1783820000000-BackfillDefaultRolePermissions.ts) | TypeScript | 91 | 33 | 11 | 135 |
| [backend/src/database/migrations/1783830000000-CreateSubscriptionLicenses.ts](/backend/src/database/migrations/1783830000000-CreateSubscriptionLicenses.ts) | TypeScript | 33 | 11 | 4 | 48 |
| [backend/src/database/migrations/1783840000000-CreateTenantProvisioning.ts](/backend/src/database/migrations/1783840000000-CreateTenantProvisioning.ts) | TypeScript | 83 | 20 | 4 | 107 |
| [backend/src/database/migrations/1783850000000-CreateFeatureFlags.ts](/backend/src/database/migrations/1783850000000-CreateFeatureFlags.ts) | TypeScript | 49 | 18 | 4 | 71 |
| [backend/src/database/seeds/patch-card-thresholds.sql](/backend/src/database/seeds/patch-card-thresholds.sql) | MS SQL | 18 | 14 | 7 | 39 |
| [backend/src/database/seeds/patch-eic-permissions.sql](/backend/src/database/seeds/patch-eic-permissions.sql) | MS SQL | 60 | 18 | 11 | 89 |
| [backend/src/database/seeds/patch-receptionist-role.sql](/backend/src/database/seeds/patch-receptionist-role.sql) | MS SQL | 28 | 12 | 7 | 47 |
| [backend/src/database/seeds/patch-role-permissions.sql](/backend/src/database/seeds/patch-role-permissions.sql) | MS SQL | 55 | 16 | 10 | 81 |
| [backend/src/database/seeds/seed-nursing-assessment-e2e.ts](/backend/src/database/seeds/seed-nursing-assessment-e2e.ts) | TypeScript | 102 | 12 | 20 | 134 |
| [backend/src/database/seeds/seed-platform.ts](/backend/src/database/seeds/seed-platform.ts) | TypeScript | 256 | 16 | 16 | 288 |
| [backend/src/database/stamp-migrations.sql](/backend/src/database/stamp-migrations.sql) | MS SQL | 23 | 4 | 2 | 29 |
| [backend/src/main.ts](/backend/src/main.ts) | TypeScript | 158 | 56 | 23 | 237 |
| [backend/src/modules/attendance/README.md](/backend/src/modules/attendance/README.md) | Markdown | 68 | 0 | 20 | 88 |
| [backend/src/modules/attendance/\_\_tests\_\_/attendance-decision-engine.service.spec.ts](/backend/src/modules/attendance/__tests__/attendance-decision-engine.service.spec.ts) | TypeScript | 160 | 0 | 30 | 190 |
| [backend/src/modules/attendance/\_\_tests\_\_/npnl-sweep-candidates.spec.ts](/backend/src/modules/attendance/__tests__/npnl-sweep-candidates.spec.ts) | TypeScript | 90 | 7 | 23 | 120 |
| [backend/src/modules/attendance/\_\_tests\_\_/npnl-sweep.service.spec.ts](/backend/src/modules/attendance/__tests__/npnl-sweep.service.spec.ts) | TypeScript | 178 | 14 | 33 | 225 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-0.5-attendance-listener.service.spec.ts](/backend/src/modules/attendance/__tests__/phase-0.5-attendance-listener.service.spec.ts) | TypeScript | 273 | 23 | 65 | 361 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-0.5-duty-actual-updater.service.spec.ts](/backend/src/modules/attendance/__tests__/phase-0.5-duty-actual-updater.service.spec.ts) | TypeScript | 206 | 35 | 46 | 287 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-0.5-oracle-polling.service.spec.ts](/backend/src/modules/attendance/__tests__/phase-0.5-oracle-polling.service.spec.ts) | TypeScript | 174 | 21 | 51 | 246 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-1-attendance-confidence.spec.ts](/backend/src/modules/attendance/__tests__/phase-1-attendance-confidence.spec.ts) | TypeScript | 94 | 15 | 23 | 132 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-1-dependency-event-router.spec.ts](/backend/src/modules/attendance/__tests__/phase-1-dependency-event-router.spec.ts) | TypeScript | 164 | 19 | 42 | 225 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-2a-dependency-pollers.spec.ts](/backend/src/modules/attendance/__tests__/phase-2a-dependency-pollers.spec.ts) | TypeScript | 415 | 47 | 71 | 533 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-2b-dependency-pollers.spec.ts](/backend/src/modules/attendance/__tests__/phase-2b-dependency-pollers.spec.ts) | TypeScript | 510 | 75 | 115 | 700 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-3-dependency-router.spec.ts](/backend/src/modules/attendance/__tests__/phase-3-dependency-router.spec.ts) | TypeScript | 362 | 31 | 70 | 463 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-4-reconciliation.spec.ts](/backend/src/modules/attendance/__tests__/phase-4-reconciliation.spec.ts) | TypeScript | 290 | 35 | 55 | 380 |
| [backend/src/modules/attendance/\_\_tests\_\_/phase-5-governance.spec.ts](/backend/src/modules/attendance/__tests__/phase-5-governance.spec.ts) | TypeScript | 468 | 29 | 94 | 591 |
| [backend/src/modules/attendance/\_\_tests\_\_/roster-resolver-eligibility.spec.ts](/backend/src/modules/attendance/__tests__/roster-resolver-eligibility.spec.ts) | TypeScript | 215 | 11 | 49 | 275 |
| [backend/src/modules/attendance/attendance-monitoring.controller.ts](/backend/src/modules/attendance/attendance-monitoring.controller.ts) | TypeScript | 86 | 5 | 17 | 108 |
| [backend/src/modules/attendance/attendance.controller.ts](/backend/src/modules/attendance/attendance.controller.ts) | TypeScript | 63 | 8 | 9 | 80 |
| [backend/src/modules/attendance/attendance.module.ts](/backend/src/modules/attendance/attendance.module.ts) | TypeScript | 109 | 5 | 2 | 116 |
| [backend/src/modules/attendance/attendance.processor.ts](/backend/src/modules/attendance/attendance.processor.ts) | TypeScript | 54 | 0 | 6 | 60 |
| [backend/src/modules/attendance/attendance.types.ts](/backend/src/modules/attendance/attendance.types.ts) | TypeScript | 108 | 31 | 10 | 149 |
| [backend/src/modules/attendance/confidence/attendance-confidence.ts](/backend/src/modules/attendance/confidence/attendance-confidence.ts) | TypeScript | 72 | 52 | 20 | 144 |
| [backend/src/modules/attendance/dependency/dependency-polling-orchestrator.service.ts](/backend/src/modules/attendance/dependency/dependency-polling-orchestrator.service.ts) | TypeScript | 139 | 33 | 26 | 198 |
| [backend/src/modules/attendance/dependency/interfaces/attendance-dependency-poller.interface.ts](/backend/src/modules/attendance/dependency/interfaces/attendance-dependency-poller.interface.ts) | TypeScript | 17 | 52 | 6 | 75 |
| [backend/src/modules/attendance/dependency/mappers/duty-plan.mapper.ts](/backend/src/modules/attendance/dependency/mappers/duty-plan.mapper.ts) | TypeScript | 36 | 21 | 9 | 66 |
| [backend/src/modules/attendance/dependency/mappers/holiday.mapper.ts](/backend/src/modules/attendance/dependency/mappers/holiday.mapper.ts) | TypeScript | 37 | 37 | 9 | 83 |
| [backend/src/modules/attendance/dependency/mappers/leave.mapper.ts](/backend/src/modules/attendance/dependency/mappers/leave.mapper.ts) | TypeScript | 36 | 22 | 9 | 67 |
| [backend/src/modules/attendance/dependency/mappers/shift-type.mapper.ts](/backend/src/modules/attendance/dependency/mappers/shift-type.mapper.ts) | TypeScript | 39 | 41 | 9 | 89 |
| [backend/src/modules/attendance/dependency/pollers/duty-plan-dependency.poller.ts](/backend/src/modules/attendance/dependency/pollers/duty-plan-dependency.poller.ts) | TypeScript | 158 | 62 | 31 | 251 |
| [backend/src/modules/attendance/dependency/pollers/holiday-dependency.poller.ts](/backend/src/modules/attendance/dependency/pollers/holiday-dependency.poller.ts) | TypeScript | 152 | 20 | 31 | 203 |
| [backend/src/modules/attendance/dependency/pollers/leave-dependency.poller.ts](/backend/src/modules/attendance/dependency/pollers/leave-dependency.poller.ts) | TypeScript | 161 | 68 | 31 | 260 |
| [backend/src/modules/attendance/dependency/pollers/shift-type-dependency.poller.ts](/backend/src/modules/attendance/dependency/pollers/shift-type-dependency.poller.ts) | TypeScript | 154 | 21 | 31 | 206 |
| [backend/src/modules/attendance/dto/attendance-monitoring-query.dto.ts](/backend/src/modules/attendance/dto/attendance-monitoring-query.dto.ts) | TypeScript | 29 | 0 | 7 | 36 |
| [backend/src/modules/attendance/dto/reconcile-attendance.dto.ts](/backend/src/modules/attendance/dto/reconcile-attendance.dto.ts) | TypeScript | 7 | 0 | 4 | 11 |
| [backend/src/modules/attendance/dto/reprocess-attendance.dto.ts](/backend/src/modules/attendance/dto/reprocess-attendance.dto.ts) | TypeScript | 11 | 0 | 4 | 15 |
| [backend/src/modules/attendance/dto/reset-attendance-cursor.dto.ts](/backend/src/modules/attendance/dto/reset-attendance-cursor.dto.ts) | TypeScript | 5 | 0 | 3 | 8 |
| [backend/src/modules/attendance/entities/attendance-audit.entity.ts](/backend/src/modules/attendance/entities/attendance-audit.entity.ts) | TypeScript | 34 | 6 | 15 | 55 |
| [backend/src/modules/attendance/entities/attendance-dependency-event.entity.ts](/backend/src/modules/attendance/entities/attendance-dependency-event.entity.ts) | TypeScript | 40 | 14 | 16 | 70 |
| [backend/src/modules/attendance/entities/attendance-dependency-snapshot.entity.ts](/backend/src/modules/attendance/entities/attendance-dependency-snapshot.entity.ts) | TypeScript | 31 | 30 | 11 | 72 |
| [backend/src/modules/attendance/entities/attendance-divergence-log.entity.ts](/backend/src/modules/attendance/entities/attendance-divergence-log.entity.ts) | TypeScript | 36 | 25 | 13 | 74 |
| [backend/src/modules/attendance/entities/attendance-event.entity.ts](/backend/src/modules/attendance/entities/attendance-event.entity.ts) | TypeScript | 49 | 9 | 18 | 76 |
| [backend/src/modules/attendance/entities/attendance-governance-lock.entity.ts](/backend/src/modules/attendance/entities/attendance-governance-lock.entity.ts) | TypeScript | 36 | 21 | 14 | 71 |
| [backend/src/modules/attendance/entities/attendance-reconciliation.entity.ts](/backend/src/modules/attendance/entities/attendance-reconciliation.entity.ts) | TypeScript | 25 | 6 | 12 | 43 |
| [backend/src/modules/attendance/entities/attendance-rule.entity.ts](/backend/src/modules/attendance/entities/attendance-rule.entity.ts) | TypeScript | 29 | 7 | 12 | 48 |
| [backend/src/modules/attendance/entities/attendance-skip-log.entity.ts](/backend/src/modules/attendance/entities/attendance-skip-log.entity.ts) | TypeScript | 32 | 20 | 12 | 64 |
| [backend/src/modules/attendance/events/attendance-dependency-changed.event.ts](/backend/src/modules/attendance/events/attendance-dependency-changed.event.ts) | TypeScript | 28 | 29 | 7 | 64 |
| [backend/src/modules/attendance/services/attendance-audit.service.ts](/backend/src/modules/attendance/services/attendance-audit.service.ts) | TypeScript | 38 | 3 | 4 | 45 |
| [backend/src/modules/attendance/services/attendance-config.service.ts](/backend/src/modules/attendance/services/attendance-config.service.ts) | TypeScript | 214 | 202 | 10 | 426 |
| [backend/src/modules/attendance/services/attendance-decision-engine.service.ts](/backend/src/modules/attendance/services/attendance-decision-engine.service.ts) | TypeScript | 216 | 4 | 19 | 239 |
| [backend/src/modules/attendance/services/attendance-governance.service.ts](/backend/src/modules/attendance/services/attendance-governance.service.ts) | TypeScript | 191 | 65 | 26 | 282 |
| [backend/src/modules/attendance/services/attendance-listener.service.ts](/backend/src/modules/attendance/services/attendance-listener.service.ts) | TypeScript | 219 | 41 | 24 | 284 |
| [backend/src/modules/attendance/services/attendance-monitoring.service.ts](/backend/src/modules/attendance/services/attendance-monitoring.service.ts) | TypeScript | 516 | 7 | 47 | 570 |
| [backend/src/modules/attendance/services/attendance-processor.service.ts](/backend/src/modules/attendance/services/attendance-processor.service.ts) | TypeScript | 240 | 11 | 17 | 268 |
| [backend/src/modules/attendance/services/attendance-structured-logger.service.ts](/backend/src/modules/attendance/services/attendance-structured-logger.service.ts) | TypeScript | 140 | 8 | 19 | 167 |
| [backend/src/modules/attendance/services/dependency-event-router.service.ts](/backend/src/modules/attendance/services/dependency-event-router.service.ts) | TypeScript | 180 | 54 | 33 | 267 |
| [backend/src/modules/attendance/services/dependency-recalculation.service.ts](/backend/src/modules/attendance/services/dependency-recalculation.service.ts) | TypeScript | 137 | 50 | 17 | 204 |
| [backend/src/modules/attendance/services/dependency-snapshot.service.ts](/backend/src/modules/attendance/services/dependency-snapshot.service.ts) | TypeScript | 72 | 37 | 7 | 116 |
| [backend/src/modules/attendance/services/duty-actual-updater.service.ts](/backend/src/modules/attendance/services/duty-actual-updater.service.ts) | TypeScript | 254 | 27 | 16 | 297 |
| [backend/src/modules/attendance/services/his-divergence.service.ts](/backend/src/modules/attendance/services/his-divergence.service.ts) | TypeScript | 98 | 25 | 17 | 140 |
| [backend/src/modules/attendance/services/his-reconciliation.job.ts](/backend/src/modules/attendance/services/his-reconciliation.job.ts) | TypeScript | 187 | 35 | 30 | 252 |
| [backend/src/modules/attendance/services/night-reconciliation.job.ts](/backend/src/modules/attendance/services/night-reconciliation.job.ts) | TypeScript | 110 | 0 | 10 | 120 |
| [backend/src/modules/attendance/services/npnl-sweep.service.ts](/backend/src/modules/attendance/services/npnl-sweep.service.ts) | TypeScript | 162 | 49 | 18 | 229 |
| [backend/src/modules/attendance/services/oracle-polling.service.ts](/backend/src/modules/attendance/services/oracle-polling.service.ts) | TypeScript | 274 | 55 | 31 | 360 |
| [backend/src/modules/attendance/services/punch-history.service.ts](/backend/src/modules/attendance/services/punch-history.service.ts) | TypeScript | 213 | 43 | 23 | 279 |
| [backend/src/modules/attendance/services/realtime-queue.service.ts](/backend/src/modules/attendance/services/realtime-queue.service.ts) | TypeScript | 58 | 12 | 4 | 74 |
| [backend/src/modules/attendance/services/retroactive-recalculation.service.ts](/backend/src/modules/attendance/services/retroactive-recalculation.service.ts) | TypeScript | 186 | 37 | 28 | 251 |
| [backend/src/modules/attendance/services/roster-resolver.service.ts](/backend/src/modules/attendance/services/roster-resolver.service.ts) | TypeScript | 443 | 38 | 23 | 504 |
| [backend/src/modules/attendance/services/shift-rule-engine.service.ts](/backend/src/modules/attendance/services/shift-rule-engine.service.ts) | TypeScript | 59 | 0 | 9 | 68 |
| [backend/src/modules/audit/audit.module.ts](/backend/src/modules/audit/audit.module.ts) | TypeScript | 18 | 2 | 2 | 22 |
| [backend/src/modules/audit/audit.processor.ts](/backend/src/modules/audit/audit.processor.ts) | TypeScript | 39 | 3 | 4 | 46 |
| [backend/src/modules/audit/audit.service.ts](/backend/src/modules/audit/audit.service.ts) | TypeScript | 38 | 21 | 4 | 63 |
| [backend/src/modules/audit/entities/audit-log.entity.ts](/backend/src/modules/audit/entities/audit-log.entity.ts) | TypeScript | 37 | 5 | 15 | 57 |
| [backend/src/modules/auth/\_\_tests\_\_/auth.service.spec.ts](/backend/src/modules/auth/__tests__/auth.service.spec.ts) | TypeScript | 191 | 4 | 44 | 239 |
| [backend/src/modules/auth/auth.controller.ts](/backend/src/modules/auth/auth.controller.ts) | TypeScript | 323 | 49 | 36 | 408 |
| [backend/src/modules/auth/auth.module.ts](/backend/src/modules/auth/auth.module.ts) | TypeScript | 56 | 9 | 2 | 67 |
| [backend/src/modules/auth/auth.service.ts](/backend/src/modules/auth/auth.service.ts) | TypeScript | 553 | 145 | 91 | 789 |
| [backend/src/modules/auth/dto/change-password.dto.ts](/backend/src/modules/auth/dto/change-password.dto.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [backend/src/modules/auth/dto/login.dto.ts](/backend/src/modules/auth/dto/login.dto.ts) | TypeScript | 15 | 0 | 3 | 18 |
| [backend/src/modules/auth/dto/refresh-token.dto.ts](/backend/src/modules/auth/dto/refresh-token.dto.ts) | TypeScript | 8 | 0 | 2 | 10 |
| [backend/src/modules/auth/entities/password-reset-request.entity.ts](/backend/src/modules/auth/entities/password-reset-request.entity.ts) | TypeScript | 54 | 5 | 21 | 80 |
| [backend/src/modules/auth/password-reset.service.ts](/backend/src/modules/auth/password-reset.service.ts) | TypeScript | 277 | 52 | 63 | 392 |
| [backend/src/modules/auth/setup.controller.ts](/backend/src/modules/auth/setup.controller.ts) | TypeScript | 117 | 0 | 10 | 127 |
| [backend/src/modules/auth/strategies/jwt.strategy.ts](/backend/src/modules/auth/strategies/jwt.strategy.ts) | TypeScript | 129 | 58 | 13 | 200 |
| [backend/src/modules/branch/branch.controller.ts](/backend/src/modules/branch/branch.controller.ts) | TypeScript | 63 | 5 | 8 | 76 |
| [backend/src/modules/branch/branch.module.ts](/backend/src/modules/branch/branch.module.ts) | TypeScript | 12 | 0 | 2 | 14 |
| [backend/src/modules/branch/branch.service.ts](/backend/src/modules/branch/branch.service.ts) | TypeScript | 115 | 31 | 25 | 171 |
| [backend/src/modules/cms/audit/cms-audit.controller.ts](/backend/src/modules/cms/audit/cms-audit.controller.ts) | TypeScript | 25 | 0 | 3 | 28 |
| [backend/src/modules/cms/audit/cms-audit.service.ts](/backend/src/modules/cms/audit/cms-audit.service.ts) | TypeScript | 60 | 10 | 8 | 78 |
| [backend/src/modules/cms/cleanup/cms-asset-cleanup.controller.ts](/backend/src/modules/cms/cleanup/cms-asset-cleanup.controller.ts) | TypeScript | 16 | 1 | 3 | 20 |
| [backend/src/modules/cms/cleanup/cms-asset-cleanup.service.ts](/backend/src/modules/cms/cleanup/cms-asset-cleanup.service.ts) | TypeScript | 78 | 20 | 10 | 108 |
| [backend/src/modules/cms/cms.module.ts](/backend/src/modules/cms/cms.module.ts) | TypeScript | 109 | 36 | 19 | 164 |
| [backend/src/modules/cms/commands/cms-display-command.controller.ts](/backend/src/modules/cms/commands/cms-display-command.controller.ts) | TypeScript | 31 | 0 | 6 | 37 |
| [backend/src/modules/cms/commands/cms-display-command.service.ts](/backend/src/modules/cms/commands/cms-display-command.service.ts) | TypeScript | 86 | 17 | 15 | 118 |
| [backend/src/modules/cms/display/cms-display.controller.ts](/backend/src/modules/cms/display/cms-display.controller.ts) | TypeScript | 100 | 25 | 18 | 143 |
| [backend/src/modules/cms/display/cms-display.service.ts](/backend/src/modules/cms/display/cms-display.service.ts) | TypeScript | 203 | 30 | 30 | 263 |
| [backend/src/modules/cms/emergency/cms-emergency.controller.ts](/backend/src/modules/cms/emergency/cms-emergency.controller.ts) | TypeScript | 49 | 20 | 7 | 76 |
| [backend/src/modules/cms/emergency/cms-emergency.service.ts](/backend/src/modules/cms/emergency/cms-emergency.service.ts) | TypeScript | 88 | 13 | 13 | 114 |
| [backend/src/modules/cms/entities/cms-audit-log.entity.ts](/backend/src/modules/cms/entities/cms-audit-log.entity.ts) | TypeScript | 25 | 17 | 11 | 53 |
| [backend/src/modules/cms/entities/cms-display-assignment.entity.ts](/backend/src/modules/cms/entities/cms-display-assignment.entity.ts) | TypeScript | 69 | 39 | 37 | 145 |
| [backend/src/modules/cms/entities/cms-display-command.entity.ts](/backend/src/modules/cms/entities/cms-display-command.entity.ts) | TypeScript | 22 | 13 | 10 | 45 |
| [backend/src/modules/cms/entities/cms-display-group.entity.ts](/backend/src/modules/cms/entities/cms-display-group.entity.ts) | TypeScript | 20 | 11 | 9 | 40 |
| [backend/src/modules/cms/entities/cms-emergency-broadcast.entity.ts](/backend/src/modules/cms/entities/cms-emergency-broadcast.entity.ts) | TypeScript | 24 | 19 | 11 | 54 |
| [backend/src/modules/cms/entities/cms-media.entity.ts](/backend/src/modules/cms/entities/cms-media.entity.ts) | TypeScript | 39 | 28 | 19 | 86 |
| [backend/src/modules/cms/entities/cms-player-log.entity.ts](/backend/src/modules/cms/entities/cms-player-log.entity.ts) | TypeScript | 18 | 14 | 8 | 40 |
| [backend/src/modules/cms/entities/cms-playlist-item.entity.ts](/backend/src/modules/cms/entities/cms-playlist-item.entity.ts) | TypeScript | 32 | 30 | 15 | 77 |
| [backend/src/modules/cms/entities/cms-playlist-schedule.entity.ts](/backend/src/modules/cms/entities/cms-playlist-schedule.entity.ts) | TypeScript | 32 | 21 | 15 | 68 |
| [backend/src/modules/cms/entities/cms-playlist.entity.ts](/backend/src/modules/cms/entities/cms-playlist.entity.ts) | TypeScript | 28 | 17 | 13 | 58 |
| [backend/src/modules/cms/entities/cms-publish-version.entity.ts](/backend/src/modules/cms/entities/cms-publish-version.entity.ts) | TypeScript | 18 | 21 | 8 | 47 |
| [backend/src/modules/cms/entities/cms-settings.entity.ts](/backend/src/modules/cms/entities/cms-settings.entity.ts) | TypeScript | 28 | 12 | 13 | 53 |
| [backend/src/modules/cms/entities/cms-ticker-message.entity.ts](/backend/src/modules/cms/entities/cms-ticker-message.entity.ts) | TypeScript | 35 | 35 | 17 | 87 |
| [backend/src/modules/cms/groups/cms-display-group.controller.ts](/backend/src/modules/cms/groups/cms-display-group.controller.ts) | TypeScript | 48 | 1 | 10 | 59 |
| [backend/src/modules/cms/groups/cms-display-group.service.ts](/backend/src/modules/cms/groups/cms-display-group.service.ts) | TypeScript | 82 | 12 | 10 | 104 |
| [backend/src/modules/cms/logs/cms-player-log.service.ts](/backend/src/modules/cms/logs/cms-player-log.service.ts) | TypeScript | 59 | 15 | 11 | 85 |
| [backend/src/modules/cms/media/\_ci\_test\_violation.ts](/backend/src/modules/cms/media/_ci_test_violation.ts) | TypeScript | 0 | 6 | 1 | 7 |
| [backend/src/modules/cms/media/\_test2.ts](/backend/src/modules/cms/media/_test2.ts) | TypeScript | 0 | 3 | 1 | 4 |
| [backend/src/modules/cms/media/cms-media.controller.ts](/backend/src/modules/cms/media/cms-media.controller.ts) | TypeScript | 123 | 12 | 21 | 156 |
| [backend/src/modules/cms/media/cms-media.service.ts](/backend/src/modules/cms/media/cms-media.service.ts) | TypeScript | 101 | 18 | 14 | 133 |
| [backend/src/modules/cms/media/image-dimensions.util.ts](/backend/src/modules/cms/media/image-dimensions.util.ts) | TypeScript | 34 | 9 | 5 | 48 |
| [backend/src/modules/cms/playlist/cms-playlist.controller.ts](/backend/src/modules/cms/playlist/cms-playlist.controller.ts) | TypeScript | 103 | 5 | 23 | 131 |
| [backend/src/modules/cms/playlist/cms-playlist.service.ts](/backend/src/modules/cms/playlist/cms-playlist.service.ts) | TypeScript | 355 | 61 | 56 | 472 |
| [backend/src/modules/cms/schedule/cms-schedule.controller.ts](/backend/src/modules/cms/schedule/cms-schedule.controller.ts) | TypeScript | 37 | 1 | 7 | 45 |
| [backend/src/modules/cms/schedule/cms-schedule.service.ts](/backend/src/modules/cms/schedule/cms-schedule.service.ts) | TypeScript | 127 | 27 | 21 | 175 |
| [backend/src/modules/cms/settings/cms-settings.controller.ts](/backend/src/modules/cms/settings/cms-settings.controller.ts) | TypeScript | 24 | 0 | 5 | 29 |
| [backend/src/modules/cms/settings/cms-settings.service.ts](/backend/src/modules/cms/settings/cms-settings.service.ts) | TypeScript | 36 | 7 | 6 | 49 |
| [backend/src/modules/cms/ticker/cms-ticker.controller.ts](/backend/src/modules/cms/ticker/cms-ticker.controller.ts) | TypeScript | 45 | 13 | 9 | 67 |
| [backend/src/modules/cms/ticker/cms-ticker.service.ts](/backend/src/modules/cms/ticker/cms-ticker.service.ts) | TypeScript | 155 | 28 | 26 | 209 |
| [backend/src/modules/document-platform/ai-facades/document-ai-facades.service.ts](/backend/src/modules/document-platform/ai-facades/document-ai-facades.service.ts) | TypeScript | 72 | 8 | 18 | 98 |
| [backend/src/modules/document-platform/asset-library/asset-library.module.ts](/backend/src/modules/document-platform/asset-library/asset-library.module.ts) | TypeScript | 12 | 0 | 2 | 14 |
| [backend/src/modules/document-platform/asset-library/controllers/asset-library.controller.ts](/backend/src/modules/document-platform/asset-library/controllers/asset-library.controller.ts) | TypeScript | 45 | 0 | 11 | 56 |
| [backend/src/modules/document-platform/asset-library/entities/asset.entity.ts](/backend/src/modules/document-platform/asset-library/entities/asset.entity.ts) | TypeScript | 20 | 0 | 9 | 29 |
| [backend/src/modules/document-platform/asset-library/services/asset-library.service.ts](/backend/src/modules/document-platform/asset-library/services/asset-library.service.ts) | TypeScript | 33 | 0 | 5 | 38 |
| [backend/src/modules/document-platform/compliance-engine/\_\_tests\_\_/compliance-validator.service.spec.ts](/backend/src/modules/document-platform/compliance-engine/__tests__/compliance-validator.service.spec.ts) | TypeScript | 58 | 0 | 11 | 69 |
| [backend/src/modules/document-platform/compliance-engine/\_\_tests\_\_/evidence-chain.listener.spec.ts](/backend/src/modules/document-platform/compliance-engine/__tests__/evidence-chain.listener.spec.ts) | TypeScript | 63 | 0 | 13 | 76 |
| [backend/src/modules/document-platform/compliance-engine/\_\_tests\_\_/integrity-engine.service.spec.ts](/backend/src/modules/document-platform/compliance-engine/__tests__/integrity-engine.service.spec.ts) | TypeScript | 32 | 0 | 11 | 43 |
| [backend/src/modules/document-platform/compliance-engine/\_\_tests\_\_/signature-framework.service.spec.ts](/backend/src/modules/document-platform/compliance-engine/__tests__/signature-framework.service.spec.ts) | TypeScript | 59 | 0 | 10 | 69 |
| [backend/src/modules/document-platform/compliance-engine/compliance-engine.module.ts](/backend/src/modules/document-platform/compliance-engine/compliance-engine.module.ts) | TypeScript | 42 | 0 | 2 | 44 |
| [backend/src/modules/document-platform/compliance-engine/entities/compliance-profile.entity.ts](/backend/src/modules/document-platform/compliance-engine/entities/compliance-profile.entity.ts) | TypeScript | 34 | 2 | 13 | 49 |
| [backend/src/modules/document-platform/compliance-engine/entities/document-signature.entity.ts](/backend/src/modules/document-platform/compliance-engine/entities/document-signature.entity.ts) | TypeScript | 29 | 2 | 13 | 44 |
| [backend/src/modules/document-platform/compliance-engine/entities/evidence-chain.entity.ts](/backend/src/modules/document-platform/compliance-engine/entities/evidence-chain.entity.ts) | TypeScript | 30 | 4 | 11 | 45 |
| [backend/src/modules/document-platform/compliance-engine/interfaces/document-renderer.interface.ts](/backend/src/modules/document-platform/compliance-engine/interfaces/document-renderer.interface.ts) | TypeScript | 10 | 6 | 3 | 19 |
| [backend/src/modules/document-platform/compliance-engine/services/compliance-validator.service.ts](/backend/src/modules/document-platform/compliance-engine/services/compliance-validator.service.ts) | TypeScript | 53 | 7 | 10 | 70 |
| [backend/src/modules/document-platform/compliance-engine/services/document-rendering-engine.service.ts](/backend/src/modules/document-platform/compliance-engine/services/document-rendering-engine.service.ts) | TypeScript | 21 | 0 | 5 | 26 |
| [backend/src/modules/document-platform/compliance-engine/services/evidence-chain.listener.ts](/backend/src/modules/document-platform/compliance-engine/services/evidence-chain.listener.ts) | TypeScript | 45 | 1 | 9 | 55 |
| [backend/src/modules/document-platform/compliance-engine/services/integrity-engine.service.ts](/backend/src/modules/document-platform/compliance-engine/services/integrity-engine.service.ts) | TypeScript | 28 | 7 | 8 | 43 |
| [backend/src/modules/document-platform/compliance-engine/services/renderers/pdf-document.renderer.ts](/backend/src/modules/document-platform/compliance-engine/services/renderers/pdf-document.renderer.ts) | TypeScript | 16 | 3 | 5 | 24 |
| [backend/src/modules/document-platform/compliance-engine/services/signature-framework.service.ts](/backend/src/modules/document-platform/compliance-engine/services/signature-framework.service.ts) | TypeScript | 49 | 5 | 10 | 64 |
| [backend/src/modules/document-platform/document-engine/\_\_tests\_\_/audit-trail.listener.spec.ts](/backend/src/modules/document-platform/document-engine/__tests__/audit-trail.listener.spec.ts) | TypeScript | 46 | 0 | 8 | 54 |
| [backend/src/modules/document-platform/document-engine/\_\_tests\_\_/document.service.spec.ts](/backend/src/modules/document-platform/document-engine/__tests__/document.service.spec.ts) | TypeScript | 117 | 11 | 16 | 144 |
| [backend/src/modules/document-platform/document-engine/document-engine.module.ts](/backend/src/modules/document-platform/document-engine/document-engine.module.ts) | TypeScript | 58 | 8 | 3 | 69 |
| [backend/src/modules/document-platform/document-engine/document-type-registry/document-type-registry.service.ts](/backend/src/modules/document-platform/document-engine/document-type-registry/document-type-registry.service.ts) | TypeScript | 25 | 5 | 6 | 36 |
| [backend/src/modules/document-platform/document-engine/document-type-registry/document-type.interface.ts](/backend/src/modules/document-platform/document-engine/document-type-registry/document-type.interface.ts) | TypeScript | 9 | 27 | 1 | 37 |
| [backend/src/modules/document-platform/document-engine/entities/document-audit-trail.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-audit-trail.entity.ts) | TypeScript | 31 | 6 | 14 | 51 |
| [backend/src/modules/document-platform/document-engine/entities/document-instance.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-instance.entity.ts) | TypeScript | 45 | 7 | 16 | 68 |
| [backend/src/modules/document-platform/document-engine/entities/document-override-version.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-override-version.entity.ts) | TypeScript | 20 | 4 | 8 | 32 |
| [backend/src/modules/document-platform/document-engine/entities/document-override.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-override.entity.ts) | TypeScript | 18 | 11 | 8 | 37 |
| [backend/src/modules/document-platform/document-engine/entities/document-signature.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-signature.entity.ts) | TypeScript | 24 | 5 | 11 | 40 |
| [backend/src/modules/document-platform/document-engine/entities/document-snapshot.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-snapshot.entity.ts) | TypeScript | 37 | 8 | 16 | 61 |
| [backend/src/modules/document-platform/document-engine/entities/document-version.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document-version.entity.ts) | TypeScript | 24 | 7 | 10 | 41 |
| [backend/src/modules/document-platform/document-engine/entities/document.entity.ts](/backend/src/modules/document-platform/document-engine/entities/document.entity.ts) | TypeScript | 25 | 8 | 10 | 43 |
| [backend/src/modules/document-platform/document-engine/lifecycle/state-machine.ts](/backend/src/modules/document-platform/document-engine/lifecycle/state-machine.ts) | TypeScript | 27 | 13 | 7 | 47 |
| [backend/src/modules/document-platform/document-engine/pdf/pdf-engine.service.ts](/backend/src/modules/document-platform/document-engine/pdf/pdf-engine.service.ts) | TypeScript | 31 | 26 | 5 | 62 |
| [backend/src/modules/document-platform/document-engine/services/audit-trail.listener.ts](/backend/src/modules/document-platform/document-engine/services/audit-trail.listener.ts) | TypeScript | 71 | 0 | 7 | 78 |
| [backend/src/modules/document-platform/document-engine/services/default-signature-provider.service.ts](/backend/src/modules/document-platform/document-engine/services/default-signature-provider.service.ts) | TypeScript | 40 | 1 | 8 | 49 |
| [backend/src/modules/document-platform/document-engine/services/document-instance.service.ts](/backend/src/modules/document-platform/document-engine/services/document-instance.service.ts) | TypeScript | 101 | 25 | 18 | 144 |
| [backend/src/modules/document-platform/document-engine/services/document-override.service.ts](/backend/src/modules/document-platform/document-engine/services/document-override.service.ts) | TypeScript | 63 | 1 | 11 | 75 |
| [backend/src/modules/document-platform/document-engine/services/document-snapshot.service.ts](/backend/src/modules/document-platform/document-engine/services/document-snapshot.service.ts) | TypeScript | 43 | 0 | 4 | 47 |
| [backend/src/modules/document-platform/document-engine/services/document.service.ts](/backend/src/modules/document-platform/document-engine/services/document.service.ts) | TypeScript | 115 | 38 | 17 | 170 |
| [backend/src/modules/document-platform/document-engine/services/pdf-archival.service.ts](/backend/src/modules/document-platform/document-engine/services/pdf-archival.service.ts) | TypeScript | 25 | 7 | 10 | 42 |
| [backend/src/modules/document-platform/document-engine/services/signature-provider.interface.ts](/backend/src/modules/document-platform/document-engine/services/signature-provider.interface.ts) | TypeScript | 16 | 2 | 4 | 22 |
| [backend/src/modules/document-platform/document-events/document.events.ts](/backend/src/modules/document-platform/document-events/document.events.ts) | TypeScript | 37 | 0 | 6 | 43 |
| [backend/src/modules/document-platform/document-platform.module.ts](/backend/src/modules/document-platform/document-platform.module.ts) | TypeScript | 23 | 7 | 6 | 36 |
| [backend/src/modules/document-platform/forms-designer/\_\_tests\_\_/forms-designer.service.spec.ts](/backend/src/modules/document-platform/forms-designer/__tests__/forms-designer.service.spec.ts) | TypeScript | 120 | 13 | 16 | 149 |
| [backend/src/modules/document-platform/forms-designer/dto/create-form-document.dto.ts](/backend/src/modules/document-platform/forms-designer/dto/create-form-document.dto.ts) | TypeScript | 15 | 0 | 4 | 19 |
| [backend/src/modules/document-platform/forms-designer/dto/save-form-version.dto.ts](/backend/src/modules/document-platform/forms-designer/dto/save-form-version.dto.ts) | TypeScript | 9 | 0 | 2 | 11 |
| [backend/src/modules/document-platform/forms-designer/dto/save-override.dto.ts](/backend/src/modules/document-platform/forms-designer/dto/save-override.dto.ts) | TypeScript | 20 | 0 | 5 | 25 |
| [backend/src/modules/document-platform/forms-designer/forms-designer.controller.ts](/backend/src/modules/document-platform/forms-designer/forms-designer.controller.ts) | TypeScript | 113 | 13 | 12 | 138 |
| [backend/src/modules/document-platform/forms-designer/forms-designer.module.ts](/backend/src/modules/document-platform/forms-designer/forms-designer.module.ts) | TypeScript | 30 | 18 | 3 | 51 |
| [backend/src/modules/document-platform/forms-designer/forms-designer.service.ts](/backend/src/modules/document-platform/forms-designer/forms-designer.service.ts) | TypeScript | 53 | 22 | 11 | 86 |
| [backend/src/modules/document-platform/forms-designer/pdf/form-pdf-renderer.ts](/backend/src/modules/document-platform/forms-designer/pdf/form-pdf-renderer.ts) | TypeScript | 118 | 44 | 15 | 177 |
| [backend/src/modules/document-platform/forms-import/\_\_tests\_\_/layout-analyzer.spec.ts](/backend/src/modules/document-platform/forms-import/__tests__/layout-analyzer.spec.ts) | TypeScript | 61 | 5 | 12 | 78 |
| [backend/src/modules/document-platform/forms-import/\_\_tests\_\_/schema-generator.spec.ts](/backend/src/modules/document-platform/forms-import/__tests__/schema-generator.spec.ts) | TypeScript | 90 | 0 | 13 | 103 |
| [backend/src/modules/document-platform/forms-import/\_\_tests\_\_/semantic-classifier.spec.ts](/backend/src/modules/document-platform/forms-import/__tests__/semantic-classifier.spec.ts) | TypeScript | 79 | 2 | 10 | 91 |
| [backend/src/modules/document-platform/forms-import/classifier/ai-classifier-provider.interface.ts](/backend/src/modules/document-platform/forms-import/classifier/ai-classifier-provider.interface.ts) | TypeScript | 31 | 22 | 6 | 59 |
| [backend/src/modules/document-platform/forms-import/classifier/gemini-classifier.provider.ts](/backend/src/modules/document-platform/forms-import/classifier/gemini-classifier.provider.ts) | TypeScript | 149 | 14 | 12 | 175 |
| [backend/src/modules/document-platform/forms-import/classifier/rule-based-classifier.provider.ts](/backend/src/modules/document-platform/forms-import/classifier/rule-based-classifier.provider.ts) | TypeScript | 93 | 26 | 20 | 139 |
| [backend/src/modules/document-platform/forms-import/classifier/semantic-classifier.ts](/backend/src/modules/document-platform/forms-import/classifier/semantic-classifier.ts) | TypeScript | 80 | 17 | 12 | 109 |
| [backend/src/modules/document-platform/forms-import/entities/import-job.entity.ts](/backend/src/modules/document-platform/forms-import/entities/import-job.entity.ts) | TypeScript | 106 | 6 | 27 | 139 |
| [backend/src/modules/document-platform/forms-import/forms-import.controller.ts](/backend/src/modules/document-platform/forms-import/forms-import.controller.ts) | TypeScript | 74 | 18 | 7 | 99 |
| [backend/src/modules/document-platform/forms-import/forms-import.module.ts](/backend/src/modules/document-platform/forms-import/forms-import.module.ts) | TypeScript | 36 | 0 | 2 | 38 |
| [backend/src/modules/document-platform/forms-import/forms-import.service.ts](/backend/src/modules/document-platform/forms-import/forms-import.service.ts) | TypeScript | 190 | 21 | 33 | 244 |
| [backend/src/modules/document-platform/forms-import/layout/layout-analyzer.ts](/backend/src/modules/document-platform/forms-import/layout/layout-analyzer.ts) | TypeScript | 127 | 19 | 20 | 166 |
| [backend/src/modules/document-platform/forms-import/ocr/ocr-provider.interface.ts](/backend/src/modules/document-platform/forms-import/ocr/ocr-provider.interface.ts) | TypeScript | 6 | 11 | 4 | 21 |
| [backend/src/modules/document-platform/forms-import/ocr/tesseract-ocr.provider.ts](/backend/src/modules/document-platform/forms-import/ocr/tesseract-ocr.provider.ts) | TypeScript | 115 | 20 | 10 | 145 |
| [backend/src/modules/document-platform/forms-import/schema-gen/schema-generator.ts](/backend/src/modules/document-platform/forms-import/schema-gen/schema-generator.ts) | TypeScript | 99 | 13 | 12 | 124 |
| [backend/src/modules/document-platform/forms-import/suggestions/suggestion-engine.ts](/backend/src/modules/document-platform/forms-import/suggestions/suggestion-engine.ts) | TypeScript | 113 | 15 | 14 | 142 |
| [backend/src/modules/document-platform/forms-runtime/\_\_tests\_\_/forms-runtime.service.spec.ts](/backend/src/modules/document-platform/forms-runtime/__tests__/forms-runtime.service.spec.ts) | TypeScript | 302 | 40 | 42 | 384 |
| [backend/src/modules/document-platform/forms-runtime/dto/create-form-instance.dto.ts](/backend/src/modules/document-platform/forms-runtime/dto/create-form-instance.dto.ts) | TypeScript | 24 | 0 | 6 | 30 |
| [backend/src/modules/document-platform/forms-runtime/dto/finalize-instance.dto.ts](/backend/src/modules/document-platform/forms-runtime/dto/finalize-instance.dto.ts) | TypeScript | 8 | 0 | 2 | 10 |
| [backend/src/modules/document-platform/forms-runtime/dto/save-answers.dto.ts](/backend/src/modules/document-platform/forms-runtime/dto/save-answers.dto.ts) | TypeScript | 12 | 0 | 3 | 15 |
| [backend/src/modules/document-platform/forms-runtime/execution-context/data-source-provider.interface.ts](/backend/src/modules/document-platform/forms-runtime/execution-context/data-source-provider.interface.ts) | TypeScript | 12 | 8 | 3 | 23 |
| [backend/src/modules/document-platform/forms-runtime/execution-context/execution-context.builder.ts](/backend/src/modules/document-platform/forms-runtime/execution-context/execution-context.builder.ts) | TypeScript | 38 | 1 | 8 | 47 |
| [backend/src/modules/document-platform/forms-runtime/execution-platform/computed-fields.engine.ts](/backend/src/modules/document-platform/forms-runtime/execution-platform/computed-fields.engine.ts) | TypeScript | 13 | 11 | 5 | 29 |
| [backend/src/modules/document-platform/forms-runtime/execution-platform/execution-metrics.interceptor.ts](/backend/src/modules/document-platform/forms-runtime/execution-platform/execution-metrics.interceptor.ts) | TypeScript | 15 | 7 | 2 | 24 |
| [backend/src/modules/document-platform/forms-runtime/execution-platform/lifecycle-orchestrator.service.ts](/backend/src/modules/document-platform/forms-runtime/execution-platform/lifecycle-orchestrator.service.ts) | TypeScript | 106 | 23 | 24 | 153 |
| [backend/src/modules/document-platform/forms-runtime/execution-platform/plugin-hook.service.ts](/backend/src/modules/document-platform/forms-runtime/execution-platform/plugin-hook.service.ts) | TypeScript | 24 | 10 | 7 | 41 |
| [backend/src/modules/document-platform/forms-runtime/forms-runtime.controller.ts](/backend/src/modules/document-platform/forms-runtime/forms-runtime.controller.ts) | TypeScript | 99 | 50 | 8 | 157 |
| [backend/src/modules/document-platform/forms-runtime/forms-runtime.module.ts](/backend/src/modules/document-platform/forms-runtime/forms-runtime.module.ts) | TypeScript | 25 | 17 | 2 | 44 |
| [backend/src/modules/document-platform/forms-runtime/forms-runtime.service.ts](/backend/src/modules/document-platform/forms-runtime/forms-runtime.service.ts) | TypeScript | 57 | 31 | 12 | 100 |
| [backend/src/modules/document-platform/forms-runtime/plugin-registry.service.ts](/backend/src/modules/document-platform/forms-runtime/plugin-registry.service.ts) | TypeScript | 14 | 3 | 4 | 21 |
| [backend/src/modules/document-platform/workflow-engine/\_\_tests\_\_/task-engine.service.spec.ts](/backend/src/modules/document-platform/workflow-engine/__tests__/task-engine.service.spec.ts) | TypeScript | 72 | 4 | 13 | 89 |
| [backend/src/modules/document-platform/workflow-engine/\_\_tests\_\_/workflow-engine.service.spec.ts](/backend/src/modules/document-platform/workflow-engine/__tests__/workflow-engine.service.spec.ts) | TypeScript | 160 | 10 | 18 | 188 |
| [backend/src/modules/document-platform/workflow-engine/controllers/workflow.controller.ts](/backend/src/modules/document-platform/workflow-engine/controllers/workflow.controller.ts) | TypeScript | 33 | 2 | 5 | 40 |
| [backend/src/modules/document-platform/workflow-engine/entities/workflow-instance.entity.ts](/backend/src/modules/document-platform/workflow-engine/entities/workflow-instance.entity.ts) | TypeScript | 26 | 0 | 12 | 38 |
| [backend/src/modules/document-platform/workflow-engine/entities/workflow-task.entity.ts](/backend/src/modules/document-platform/workflow-engine/entities/workflow-task.entity.ts) | TypeScript | 40 | 1 | 19 | 60 |
| [backend/src/modules/document-platform/workflow-engine/entities/workflow-template.entity.ts](/backend/src/modules/document-platform/workflow-engine/entities/workflow-template.entity.ts) | TypeScript | 19 | 0 | 8 | 27 |
| [backend/src/modules/document-platform/workflow-engine/listeners/workflow-notification.listener.ts](/backend/src/modules/document-platform/workflow-engine/listeners/workflow-notification.listener.ts) | TypeScript | 12 | 1 | 3 | 16 |
| [backend/src/modules/document-platform/workflow-engine/models/workflow-definition.ts](/backend/src/modules/document-platform/workflow-engine/models/workflow-definition.ts) | TypeScript | 29 | 5 | 8 | 42 |
| [backend/src/modules/document-platform/workflow-engine/services/task-engine.service.ts](/backend/src/modules/document-platform/workflow-engine/services/task-engine.service.ts) | TypeScript | 89 | 6 | 19 | 114 |
| [backend/src/modules/document-platform/workflow-engine/services/workflow-data-source.provider.ts](/backend/src/modules/document-platform/workflow-engine/services/workflow-data-source.provider.ts) | TypeScript | 37 | 0 | 9 | 46 |
| [backend/src/modules/document-platform/workflow-engine/services/workflow-timeline.service.ts](/backend/src/modules/document-platform/workflow-engine/services/workflow-timeline.service.ts) | TypeScript | 91 | 4 | 11 | 106 |
| [backend/src/modules/document-platform/workflow-engine/workflow-engine.module.ts](/backend/src/modules/document-platform/workflow-engine/workflow-engine.module.ts) | TypeScript | 42 | 2 | 3 | 47 |
| [backend/src/modules/document-platform/workflow-engine/workflow-engine.service.ts](/backend/src/modules/document-platform/workflow-engine/workflow-engine.service.ts) | TypeScript | 121 | 6 | 25 | 152 |
| [backend/src/modules/eic/assessment/eic-assessment.controller.ts](/backend/src/modules/eic/assessment/eic-assessment.controller.ts) | TypeScript | 106 | 1 | 11 | 118 |
| [backend/src/modules/eic/assessment/eic-assessment.service.ts](/backend/src/modules/eic/assessment/eic-assessment.service.ts) | TypeScript | 223 | 21 | 41 | 285 |
| [backend/src/modules/eic/common/enums/assessment-status.enum.ts](/backend/src/modules/eic/common/enums/assessment-status.enum.ts) | TypeScript | 39 | 0 | 7 | 46 |
| [backend/src/modules/eic/common/enums/discipline.enum.ts](/backend/src/modules/eic/common/enums/discipline.enum.ts) | TypeScript | 16 | 0 | 2 | 18 |
| [backend/src/modules/eic/common/enums/enrollment-status.enum.ts](/backend/src/modules/eic/common/enums/enrollment-status.enum.ts) | TypeScript | 7 | 0 | 1 | 8 |
| [backend/src/modules/eic/discharge/eic-discharge.controller.ts](/backend/src/modules/eic/discharge/eic-discharge.controller.ts) | TypeScript | 93 | 0 | 9 | 102 |
| [backend/src/modules/eic/discharge/eic-discharge.service.ts](/backend/src/modules/eic/discharge/eic-discharge.service.ts) | TypeScript | 153 | 13 | 29 | 195 |
| [backend/src/modules/eic/discipline-assignment/dto/create-discipline-assignment.dto.ts](/backend/src/modules/eic/discipline-assignment/dto/create-discipline-assignment.dto.ts) | TypeScript | 16 | 0 | 6 | 22 |
| [backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.controller.ts](/backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.controller.ts) | TypeScript | 57 | 0 | 6 | 63 |
| [backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.service.ts](/backend/src/modules/eic/discipline-assignment/eic-discipline-assignment.service.ts) | TypeScript | 121 | 29 | 17 | 167 |
| [backend/src/modules/eic/eic.module.ts](/backend/src/modules/eic/eic.module.ts) | TypeScript | 120 | 13 | 9 | 142 |
| [backend/src/modules/eic/enrollment/dto/create-enrollment.dto.ts](/backend/src/modules/eic/enrollment/dto/create-enrollment.dto.ts) | TypeScript | 44 | 0 | 10 | 54 |
| [backend/src/modules/eic/enrollment/eic-enrollment.controller.ts](/backend/src/modules/eic/enrollment/eic-enrollment.controller.ts) | TypeScript | 71 | 0 | 7 | 78 |
| [backend/src/modules/eic/enrollment/eic-enrollment.service.ts](/backend/src/modules/eic/enrollment/eic-enrollment.service.ts) | TypeScript | 142 | 18 | 25 | 185 |
| [backend/src/modules/eic/entities/eic-assessment.entity.ts](/backend/src/modules/eic/entities/eic-assessment.entity.ts) | TypeScript | 69 | 7 | 27 | 103 |
| [backend/src/modules/eic/entities/eic-developmental-history.entity.ts](/backend/src/modules/eic/entities/eic-developmental-history.entity.ts) | TypeScript | 75 | 10 | 34 | 119 |
| [backend/src/modules/eic/entities/eic-discharge-section.entity.ts](/backend/src/modules/eic/entities/eic-discharge-section.entity.ts) | TypeScript | 48 | 5 | 17 | 70 |
| [backend/src/modules/eic/entities/eic-discharge-summary.entity.ts](/backend/src/modules/eic/entities/eic-discharge-summary.entity.ts) | TypeScript | 52 | 5 | 19 | 76 |
| [backend/src/modules/eic/entities/eic-discipline-progress-section.entity.ts](/backend/src/modules/eic/entities/eic-discipline-progress-section.entity.ts) | TypeScript | 56 | 6 | 21 | 83 |
| [backend/src/modules/eic/entities/eic-enrollment-discipline-assignment.entity.ts](/backend/src/modules/eic/entities/eic-enrollment-discipline-assignment.entity.ts) | TypeScript | 45 | 9 | 17 | 71 |
| [backend/src/modules/eic/entities/eic-goal.entity.ts](/backend/src/modules/eic/entities/eic-goal.entity.ts) | TypeScript | 62 | 6 | 26 | 94 |
| [backend/src/modules/eic/entities/eic-patient.entity.ts](/backend/src/modules/eic/entities/eic-patient.entity.ts) | TypeScript | 76 | 10 | 34 | 120 |
| [backend/src/modules/eic/entities/eic-preschool-assessment.entity.ts](/backend/src/modules/eic/entities/eic-preschool-assessment.entity.ts) | TypeScript | 51 | 6 | 22 | 79 |
| [backend/src/modules/eic/entities/eic-preschool-daily-report.entity.ts](/backend/src/modules/eic/entities/eic-preschool-daily-report.entity.ts) | TypeScript | 43 | 6 | 18 | 67 |
| [backend/src/modules/eic/entities/eic-preschool-enrollment.entity.ts](/backend/src/modules/eic/entities/eic-preschool-enrollment.entity.ts) | TypeScript | 45 | 5 | 18 | 68 |
| [backend/src/modules/eic/entities/eic-progress-report.entity.ts](/backend/src/modules/eic/entities/eic-progress-report.entity.ts) | TypeScript | 52 | 7 | 19 | 78 |
| [backend/src/modules/eic/entities/eic-session-entry.entity.ts](/backend/src/modules/eic/entities/eic-session-entry.entity.ts) | TypeScript | 35 | 6 | 13 | 54 |
| [backend/src/modules/eic/entities/eic-therapy-enrollment.entity.ts](/backend/src/modules/eic/entities/eic-therapy-enrollment.entity.ts) | TypeScript | 68 | 6 | 24 | 98 |
| [backend/src/modules/eic/entities/eic-therapy-session.entity.ts](/backend/src/modules/eic/entities/eic-therapy-session.entity.ts) | TypeScript | 51 | 6 | 18 | 75 |
| [backend/src/modules/eic/entities/eic-therapy-team-member.entity.ts](/backend/src/modules/eic/entities/eic-therapy-team-member.entity.ts) | TypeScript | 30 | 5 | 11 | 46 |
| [backend/src/modules/eic/goal/eic-goal.controller.ts](/backend/src/modules/eic/goal/eic-goal.controller.ts) | TypeScript | 87 | 0 | 8 | 95 |
| [backend/src/modules/eic/goal/eic-goal.service.ts](/backend/src/modules/eic/goal/eic-goal.service.ts) | TypeScript | 140 | 10 | 28 | 178 |
| [backend/src/modules/eic/patient/dto/create-patient.dto.ts](/backend/src/modules/eic/patient/dto/create-patient.dto.ts) | TypeScript | 74 | 0 | 16 | 90 |
| [backend/src/modules/eic/patient/eic-patient.controller.ts](/backend/src/modules/eic/patient/eic-patient.controller.ts) | TypeScript | 136 | 12 | 14 | 162 |
| [backend/src/modules/eic/patient/eic-patient.service.ts](/backend/src/modules/eic/patient/eic-patient.service.ts) | TypeScript | 269 | 53 | 55 | 377 |
| [backend/src/modules/eic/preschool/eic-preschool.controller.ts](/backend/src/modules/eic/preschool/eic-preschool.controller.ts) | TypeScript | 120 | 4 | 16 | 140 |
| [backend/src/modules/eic/preschool/eic-preschool.service.ts](/backend/src/modules/eic/preschool/eic-preschool.service.ts) | TypeScript | 264 | 39 | 46 | 349 |
| [backend/src/modules/eic/progress-report/eic-progress-report.controller.ts](/backend/src/modules/eic/progress-report/eic-progress-report.controller.ts) | TypeScript | 96 | 7 | 9 | 112 |
| [backend/src/modules/eic/progress-report/eic-progress-report.policy.ts](/backend/src/modules/eic/progress-report/eic-progress-report.policy.ts) | TypeScript | 51 | 0 | 8 | 59 |
| [backend/src/modules/eic/progress-report/eic-progress-report.service.ts](/backend/src/modules/eic/progress-report/eic-progress-report.service.ts) | TypeScript | 299 | 45 | 52 | 396 |
| [backend/src/modules/eic/progress-report/report.events.ts](/backend/src/modules/eic/progress-report/report.events.ts) | TypeScript | 53 | 5 | 8 | 66 |
| [backend/src/modules/eic/progress-report/workflow-policy.interface.ts](/backend/src/modules/eic/progress-report/workflow-policy.interface.ts) | TypeScript | 5 | 15 | 3 | 23 |
| [backend/src/modules/eic/session/eic-session.controller.ts](/backend/src/modules/eic/session/eic-session.controller.ts) | TypeScript | 102 | 1 | 10 | 113 |
| [backend/src/modules/eic/session/eic-session.service.ts](/backend/src/modules/eic/session/eic-session.service.ts) | TypeScript | 177 | 18 | 33 | 228 |
| [backend/src/modules/feedback/analytics/feedback-analytics.controller.ts](/backend/src/modules/feedback/analytics/feedback-analytics.controller.ts) | TypeScript | 28 | 6 | 3 | 37 |
| [backend/src/modules/feedback/analytics/feedback-analytics.service.ts](/backend/src/modules/feedback/analytics/feedback-analytics.service.ts) | TypeScript | 127 | 23 | 13 | 163 |
| [backend/src/modules/feedback/audit/feedback-audit.controller.ts](/backend/src/modules/feedback/audit/feedback-audit.controller.ts) | TypeScript | 22 | 0 | 3 | 25 |
| [backend/src/modules/feedback/audit/feedback-audit.service.ts](/backend/src/modules/feedback/audit/feedback-audit.service.ts) | TypeScript | 58 | 17 | 7 | 82 |
| [backend/src/modules/feedback/campaigns/feedback-campaign.controller.ts](/backend/src/modules/feedback/campaigns/feedback-campaign.controller.ts) | TypeScript | 49 | 4 | 7 | 60 |
| [backend/src/modules/feedback/campaigns/feedback-campaign.service.ts](/backend/src/modules/feedback/campaigns/feedback-campaign.service.ts) | TypeScript | 115 | 14 | 11 | 140 |
| [backend/src/modules/feedback/complaints/feedback-complaint.controller.ts](/backend/src/modules/feedback/complaints/feedback-complaint.controller.ts) | TypeScript | 41 | 7 | 5 | 53 |
| [backend/src/modules/feedback/complaints/feedback-complaint.service.ts](/backend/src/modules/feedback/complaints/feedback-complaint.service.ts) | TypeScript | 122 | 28 | 16 | 166 |
| [backend/src/modules/feedback/dto/feedback-campaign.dto.ts](/backend/src/modules/feedback/dto/feedback-campaign.dto.ts) | TypeScript | 86 | 0 | 18 | 104 |
| [backend/src/modules/feedback/dto/feedback-complaint.dto.ts](/backend/src/modules/feedback/dto/feedback-complaint.dto.ts) | TypeScript | 48 | 8 | 10 | 66 |
| [backend/src/modules/feedback/dto/feedback-form.dto.ts](/backend/src/modules/feedback/dto/feedback-form.dto.ts) | TypeScript | 35 | 7 | 7 | 49 |
| [backend/src/modules/feedback/dto/feedback-qr.dto.ts](/backend/src/modules/feedback/dto/feedback-qr.dto.ts) | TypeScript | 52 | 0 | 12 | 64 |
| [backend/src/modules/feedback/dto/feedback-question.dto.ts](/backend/src/modules/feedback/dto/feedback-question.dto.ts) | TypeScript | 154 | 4 | 35 | 193 |
| [backend/src/modules/feedback/dto/feedback-section.dto.ts](/backend/src/modules/feedback/dto/feedback-section.dto.ts) | TypeScript | 39 | 0 | 8 | 47 |
| [backend/src/modules/feedback/dto/feedback-settings.dto.ts](/backend/src/modules/feedback/dto/feedback-settings.dto.ts) | TypeScript | 40 | 9 | 13 | 62 |
| [backend/src/modules/feedback/dto/feedback-submission.dto.ts](/backend/src/modules/feedback/dto/feedback-submission.dto.ts) | TypeScript | 28 | 11 | 6 | 45 |
| [backend/src/modules/feedback/dto/feedback-translation.dto.ts](/backend/src/modules/feedback/dto/feedback-translation.dto.ts) | TypeScript | 50 | 1 | 10 | 61 |
| [backend/src/modules/feedback/entities/feedback-answer.entity.ts](/backend/src/modules/feedback/entities/feedback-answer.entity.ts) | TypeScript | 20 | 38 | 9 | 67 |
| [backend/src/modules/feedback/entities/feedback-audit-log.entity.ts](/backend/src/modules/feedback/entities/feedback-audit-log.entity.ts) | TypeScript | 24 | 23 | 11 | 58 |
| [backend/src/modules/feedback/entities/feedback-campaign.entity.ts](/backend/src/modules/feedback/entities/feedback-campaign.entity.ts) | TypeScript | 34 | 20 | 17 | 71 |
| [backend/src/modules/feedback/entities/feedback-complaint.entity.ts](/backend/src/modules/feedback/entities/feedback-complaint.entity.ts) | TypeScript | 39 | 23 | 19 | 81 |
| [backend/src/modules/feedback/entities/feedback-form.entity.ts](/backend/src/modules/feedback/entities/feedback-form.entity.ts) | TypeScript | 40 | 43 | 18 | 101 |
| [backend/src/modules/feedback/entities/feedback-language.entity.ts](/backend/src/modules/feedback/entities/feedback-language.entity.ts) | TypeScript | 16 | 18 | 7 | 41 |
| [backend/src/modules/feedback/entities/feedback-notification.entity.ts](/backend/src/modules/feedback/entities/feedback-notification.entity.ts) | TypeScript | 21 | 16 | 10 | 47 |
| [backend/src/modules/feedback/entities/feedback-qr-code.entity.ts](/backend/src/modules/feedback/entities/feedback-qr-code.entity.ts) | TypeScript | 33 | 18 | 15 | 66 |
| [backend/src/modules/feedback/entities/feedback-question-condition.entity.ts](/backend/src/modules/feedback/entities/feedback-question-condition.entity.ts) | TypeScript | 28 | 16 | 11 | 55 |
| [backend/src/modules/feedback/entities/feedback-question-option.entity.ts](/backend/src/modules/feedback/entities/feedback-question-option.entity.ts) | TypeScript | 20 | 7 | 8 | 35 |
| [backend/src/modules/feedback/entities/feedback-question-type.enum.ts](/backend/src/modules/feedback/entities/feedback-question-type.enum.ts) | TypeScript | 28 | 9 | 5 | 42 |
| [backend/src/modules/feedback/entities/feedback-question.entity.ts](/backend/src/modules/feedback/entities/feedback-question.entity.ts) | TypeScript | 47 | 17 | 20 | 84 |
| [backend/src/modules/feedback/entities/feedback-section.entity.ts](/backend/src/modules/feedback/entities/feedback-section.entity.ts) | TypeScript | 27 | 6 | 11 | 44 |
| [backend/src/modules/feedback/entities/feedback-settings.entity.ts](/backend/src/modules/feedback/entities/feedback-settings.entity.ts) | TypeScript | 36 | 33 | 21 | 90 |
| [backend/src/modules/feedback/entities/feedback-submission.entity.ts](/backend/src/modules/feedback/entities/feedback-submission.entity.ts) | TypeScript | 31 | 20 | 15 | 66 |
| [backend/src/modules/feedback/entities/feedback-translation.entity.ts](/backend/src/modules/feedback/entities/feedback-translation.entity.ts) | TypeScript | 23 | 22 | 11 | 56 |
| [backend/src/modules/feedback/feedback.module.ts](/backend/src/modules/feedback/feedback.module.ts) | TypeScript | 115 | 80 | 16 | 211 |
| [backend/src/modules/feedback/forms/feedback-form.controller.ts](/backend/src/modules/feedback/forms/feedback-form.controller.ts) | TypeScript | 161 | 26 | 31 | 218 |
| [backend/src/modules/feedback/forms/feedback-form.service.ts](/backend/src/modules/feedback/forms/feedback-form.service.ts) | TypeScript | 305 | 62 | 33 | 400 |
| [backend/src/modules/feedback/languages/feedback-language.controller.ts](/backend/src/modules/feedback/languages/feedback-language.controller.ts) | TypeScript | 32 | 7 | 5 | 44 |
| [backend/src/modules/feedback/languages/feedback-language.service.ts](/backend/src/modules/feedback/languages/feedback-language.service.ts) | TypeScript | 30 | 1 | 5 | 36 |
| [backend/src/modules/feedback/notifications/feedback-notification.controller.ts](/backend/src/modules/feedback/notifications/feedback-notification.controller.ts) | TypeScript | 42 | 5 | 6 | 53 |
| [backend/src/modules/feedback/notifications/feedback-notification.service.ts](/backend/src/modules/feedback/notifications/feedback-notification.service.ts) | TypeScript | 51 | 9 | 10 | 70 |
| [backend/src/modules/feedback/public/feedback-public.controller.ts](/backend/src/modules/feedback/public/feedback-public.controller.ts) | TypeScript | 35 | 11 | 5 | 51 |
| [backend/src/modules/feedback/public/feedback-public.service.ts](/backend/src/modules/feedback/public/feedback-public.service.ts) | TypeScript | 216 | 61 | 26 | 303 |
| [backend/src/modules/feedback/qr/feedback-qr.controller.ts](/backend/src/modules/feedback/qr/feedback-qr.controller.ts) | TypeScript | 66 | 6 | 10 | 82 |
| [backend/src/modules/feedback/qr/feedback-qr.service.ts](/backend/src/modules/feedback/qr/feedback-qr.service.ts) | TypeScript | 126 | 22 | 17 | 165 |
| [backend/src/modules/feedback/questions/feedback-question.controller.ts](/backend/src/modules/feedback/questions/feedback-question.controller.ts) | TypeScript | 82 | 12 | 15 | 109 |
| [backend/src/modules/feedback/questions/feedback-question.service.ts](/backend/src/modules/feedback/questions/feedback-question.service.ts) | TypeScript | 250 | 15 | 30 | 295 |
| [backend/src/modules/feedback/reports/feedback-report.controller.ts](/backend/src/modules/feedback/reports/feedback-report.controller.ts) | TypeScript | 70 | 12 | 6 | 88 |
| [backend/src/modules/feedback/reports/feedback-report.service.ts](/backend/src/modules/feedback/reports/feedback-report.service.ts) | TypeScript | 142 | 16 | 19 | 177 |
| [backend/src/modules/feedback/responses/feedback-response.controller.ts](/backend/src/modules/feedback/responses/feedback-response.controller.ts) | TypeScript | 26 | 5 | 4 | 35 |
| [backend/src/modules/feedback/responses/feedback-response.service.ts](/backend/src/modules/feedback/responses/feedback-response.service.ts) | TypeScript | 46 | 9 | 7 | 62 |
| [backend/src/modules/feedback/settings/feedback-settings.controller.ts](/backend/src/modules/feedback/settings/feedback-settings.controller.ts) | TypeScript | 28 | 5 | 4 | 37 |
| [backend/src/modules/feedback/settings/feedback-settings.service.ts](/backend/src/modules/feedback/settings/feedback-settings.service.ts) | TypeScript | 61 | 72 | 12 | 145 |
| [backend/src/modules/feedback/translations/feedback-translation.controller.ts](/backend/src/modules/feedback/translations/feedback-translation.controller.ts) | TypeScript | 44 | 7 | 5 | 56 |
| [backend/src/modules/feedback/translations/feedback-translation.service.ts](/backend/src/modules/feedback/translations/feedback-translation.service.ts) | TypeScript | 125 | 29 | 20 | 174 |
| [backend/src/modules/his/\_\_tests\_\_/oracle-transport.conformance.spec.ts](/backend/src/modules/his/__tests__/oracle-transport.conformance.spec.ts) | TypeScript | 102 | 29 | 21 | 152 |
| [backend/src/modules/his/billing/billing.service.ts](/backend/src/modules/his/billing/billing.service.ts) | TypeScript | 231 | 30 | 36 | 297 |
| [backend/src/modules/his/billing/his-loyalty-bridge.service.ts](/backend/src/modules/his/billing/his-loyalty-bridge.service.ts) | TypeScript | 176 | 33 | 18 | 227 |
| [backend/src/modules/his/cloud-oracle.transport.ts](/backend/src/modules/his/cloud-oracle.transport.ts) | TypeScript | 106 | 87 | 22 | 215 |
| [backend/src/modules/his/config/his-config.helpers.ts](/backend/src/modules/his/config/his-config.helpers.ts) | TypeScript | 39 | 76 | 6 | 121 |
| [backend/src/modules/his/config/his-config.module.ts](/backend/src/modules/his/config/his-config.module.ts) | TypeScript | 35 | 23 | 2 | 60 |
| [backend/src/modules/his/config/his-config.service.ts](/backend/src/modules/his/config/his-config.service.ts) | TypeScript | 120 | 42 | 18 | 180 |
| [backend/src/modules/his/config/his-schema-config.entity.ts](/backend/src/modules/his/config/his-schema-config.entity.ts) | TypeScript | 17 | 19 | 6 | 42 |
| [backend/src/modules/his/direct-oracle.transport.ts](/backend/src/modules/his/direct-oracle.transport.ts) | TypeScript | 32 | 12 | 7 | 51 |
| [backend/src/modules/his/his.controller.ts](/backend/src/modules/his/his.controller.ts) | TypeScript | 155 | 27 | 17 | 199 |
| [backend/src/modules/his/his.module.ts](/backend/src/modules/his/his.module.ts) | TypeScript | 43 | 0 | 2 | 45 |
| [backend/src/modules/his/his.types.ts](/backend/src/modules/his/his.types.ts) | TypeScript | 88 | 7 | 8 | 103 |
| [backend/src/modules/his/oracle-pool.service.ts](/backend/src/modules/his/oracle-pool.service.ts) | TypeScript | 115 | 40 | 15 | 170 |
| [backend/src/modules/his/patient/patient.service.ts](/backend/src/modules/his/patient/patient.service.ts) | TypeScript | 224 | 18 | 31 | 273 |
| [backend/src/modules/his/reference/\_\_tests\_\_/reference.service.spec.ts](/backend/src/modules/his/reference/__tests__/reference.service.spec.ts) | TypeScript | 86 | 0 | 16 | 102 |
| [backend/src/modules/his/reference/reference.service.ts](/backend/src/modules/his/reference/reference.service.ts) | TypeScript | 222 | 16 | 32 | 270 |
| [backend/src/modules/his/sync/his-sync.controller.ts](/backend/src/modules/his/sync/his-sync.controller.ts) | TypeScript | 55 | 22 | 6 | 83 |
| [backend/src/modules/his/sync/his-sync.module.ts](/backend/src/modules/his/sync/his-sync.module.ts) | TypeScript | 23 | 9 | 2 | 34 |
| [backend/src/modules/his/sync/his-sync.scheduler.ts](/backend/src/modules/his/sync/his-sync.scheduler.ts) | TypeScript | 55 | 32 | 12 | 99 |
| [backend/src/modules/his/sync/his-sync.service.ts](/backend/src/modules/his/sync/his-sync.service.ts) | TypeScript | 334 | 89 | 43 | 466 |
| [backend/src/modules/his/token/his-bridge.processor.ts](/backend/src/modules/his/token/his-bridge.processor.ts) | TypeScript | 18 | 12 | 6 | 36 |
| [backend/src/modules/his/token/his-token-bridge.service.ts](/backend/src/modules/his/token/his-token-bridge.service.ts) | TypeScript | 279 | 78 | 27 | 384 |
| [backend/src/modules/his/visit/visit.service.ts](/backend/src/modules/his/visit/visit.service.ts) | TypeScript | 109 | 0 | 15 | 124 |
| [backend/src/modules/licensing/\_\_tests\_\_/license-provider.conformance.spec.ts](/backend/src/modules/licensing/__tests__/license-provider.conformance.spec.ts) | TypeScript | 105 | 13 | 11 | 129 |
| [backend/src/modules/licensing/\_\_tests\_\_/license.service.spec.ts](/backend/src/modules/licensing/__tests__/license.service.spec.ts) | TypeScript | 135 | 7 | 31 | 173 |
| [backend/src/modules/licensing/decorators/require-module.decorator.ts](/backend/src/modules/licensing/decorators/require-module.decorator.ts) | TypeScript | 3 | 8 | 3 | 14 |
| [backend/src/modules/licensing/dto/license-request.dto.ts](/backend/src/modules/licensing/dto/license-request.dto.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [backend/src/modules/licensing/dto/register-hospital.dto.ts](/backend/src/modules/licensing/dto/register-hospital.dto.ts) | TypeScript | 19 | 0 | 6 | 25 |
| [backend/src/modules/licensing/dto/upload-license.dto.ts](/backend/src/modules/licensing/dto/upload-license.dto.ts) | TypeScript | 8 | 0 | 2 | 10 |
| [backend/src/modules/licensing/dto/vendor-webhook.dto.ts](/backend/src/modules/licensing/dto/vendor-webhook.dto.ts) | TypeScript | 78 | 33 | 17 | 128 |
| [backend/src/modules/licensing/entities/license-master.entity.ts](/backend/src/modules/licensing/entities/license-master.entity.ts) | TypeScript | 39 | 5 | 18 | 62 |
| [backend/src/modules/licensing/entities/license-request.entity.ts](/backend/src/modules/licensing/entities/license-request.entity.ts) | TypeScript | 27 | 9 | 12 | 48 |
| [backend/src/modules/licensing/entities/subscription-license.entity.ts](/backend/src/modules/licensing/entities/subscription-license.entity.ts) | TypeScript | 35 | 26 | 16 | 77 |
| [backend/src/modules/licensing/entities/vendor-registration.entity.ts](/backend/src/modules/licensing/entities/vendor-registration.entity.ts) | TypeScript | 33 | 10 | 15 | 58 |
| [backend/src/modules/licensing/license.controller.ts](/backend/src/modules/licensing/license.controller.ts) | TypeScript | 225 | 31 | 29 | 285 |
| [backend/src/modules/licensing/license.guard.ts](/backend/src/modules/licensing/license.guard.ts) | TypeScript | 34 | 10 | 8 | 52 |
| [backend/src/modules/licensing/license.module.ts](/backend/src/modules/licensing/license.module.ts) | TypeScript | 48 | 10 | 2 | 60 |
| [backend/src/modules/licensing/license.service.ts](/backend/src/modules/licensing/license.service.ts) | TypeScript | 470 | 107 | 64 | 641 |
| [backend/src/modules/licensing/providers/file-license.provider.ts](/backend/src/modules/licensing/providers/file-license.provider.ts) | TypeScript | 13 | 16 | 3 | 32 |
| [backend/src/modules/licensing/providers/subscription-license.provider.ts](/backend/src/modules/licensing/providers/subscription-license.provider.ts) | TypeScript | 63 | 23 | 8 | 94 |
| [backend/src/modules/licensing/vendor-sync.service.ts](/backend/src/modules/licensing/vendor-sync.service.ts) | TypeScript | 193 | 6 | 31 | 230 |
| [backend/src/modules/loyalty/campaign/campaign.controller.ts](/backend/src/modules/loyalty/campaign/campaign.controller.ts) | TypeScript | 76 | 1 | 9 | 86 |
| [backend/src/modules/loyalty/campaign/campaign.scheduler.ts](/backend/src/modules/loyalty/campaign/campaign.scheduler.ts) | TypeScript | 92 | 13 | 15 | 120 |
| [backend/src/modules/loyalty/campaign/campaign.service.ts](/backend/src/modules/loyalty/campaign/campaign.service.ts) | TypeScript | 141 | 21 | 18 | 180 |
| [backend/src/modules/loyalty/dto/campaign.dto.ts](/backend/src/modules/loyalty/dto/campaign.dto.ts) | TypeScript | 73 | 2 | 14 | 89 |
| [backend/src/modules/loyalty/dto/card-config.dto.ts](/backend/src/modules/loyalty/dto/card-config.dto.ts) | TypeScript | 60 | 0 | 10 | 70 |
| [backend/src/modules/loyalty/dto/earn-points.dto.ts](/backend/src/modules/loyalty/dto/earn-points.dto.ts) | TypeScript | 33 | 0 | 6 | 39 |
| [backend/src/modules/loyalty/dto/enroll.dto.ts](/backend/src/modules/loyalty/dto/enroll.dto.ts) | TypeScript | 23 | 0 | 5 | 28 |
| [backend/src/modules/loyalty/dto/redeem.dto.ts](/backend/src/modules/loyalty/dto/redeem.dto.ts) | TypeScript | 36 | 0 | 9 | 45 |
| [backend/src/modules/loyalty/entities/campaign.entity.ts](/backend/src/modules/loyalty/entities/campaign.entity.ts) | TypeScript | 40 | 5 | 18 | 63 |
| [backend/src/modules/loyalty/entities/card-category.entity.ts](/backend/src/modules/loyalty/entities/card-category.entity.ts) | TypeScript | 40 | 16 | 17 | 73 |
| [backend/src/modules/loyalty/entities/loyalty-account.entity.ts](/backend/src/modules/loyalty/entities/loyalty-account.entity.ts) | TypeScript | 58 | 6 | 25 | 89 |
| [backend/src/modules/loyalty/entities/loyalty-transaction.entity.ts](/backend/src/modules/loyalty/entities/loyalty-transaction.entity.ts) | TypeScript | 47 | 5 | 20 | 72 |
| [backend/src/modules/loyalty/entities/reward-catalog.entity.ts](/backend/src/modules/loyalty/entities/reward-catalog.entity.ts) | TypeScript | 30 | 7 | 13 | 50 |
| [backend/src/modules/loyalty/entities/reward-redemption.entity.ts](/backend/src/modules/loyalty/entities/reward-redemption.entity.ts) | TypeScript | 37 | 5 | 14 | 56 |
| [backend/src/modules/loyalty/loyalty.controller.ts](/backend/src/modules/loyalty/loyalty.controller.ts) | TypeScript | 185 | 13 | 18 | 216 |
| [backend/src/modules/loyalty/loyalty.module.ts](/backend/src/modules/loyalty/loyalty.module.ts) | TypeScript | 63 | 17 | 2 | 82 |
| [backend/src/modules/loyalty/loyalty.processor.ts](/backend/src/modules/loyalty/loyalty.processor.ts) | TypeScript | 32 | 5 | 5 | 42 |
| [backend/src/modules/loyalty/services/\_\_tests\_\_/point-engine.service.spec.ts](/backend/src/modules/loyalty/services/__tests__/point-engine.service.spec.ts) | TypeScript | 202 | 7 | 49 | 258 |
| [backend/src/modules/loyalty/services/card-config.service.ts](/backend/src/modules/loyalty/services/card-config.service.ts) | TypeScript | 88 | 12 | 13 | 113 |
| [backend/src/modules/loyalty/services/enrollment.service.ts](/backend/src/modules/loyalty/services/enrollment.service.ts) | TypeScript | 291 | 53 | 32 | 376 |
| [backend/src/modules/loyalty/services/point-engine.service.ts](/backend/src/modules/loyalty/services/point-engine.service.ts) | TypeScript | 86 | 20 | 20 | 126 |
| [backend/src/modules/loyalty/services/redemption.service.ts](/backend/src/modules/loyalty/services/redemption.service.ts) | TypeScript | 224 | 27 | 23 | 274 |
| [backend/src/modules/loyalty/services/transaction.service.ts](/backend/src/modules/loyalty/services/transaction.service.ts) | TypeScript | 451 | 40 | 49 | 540 |
| [backend/src/modules/notifications/dto/notification.dto.ts](/backend/src/modules/notifications/dto/notification.dto.ts) | TypeScript | 69 | 0 | 24 | 93 |
| [backend/src/modules/notifications/entities/notification-log.entity.ts](/backend/src/modules/notifications/entities/notification-log.entity.ts) | TypeScript | 46 | 13 | 18 | 77 |
| [backend/src/modules/notifications/entities/notification-template.entity.ts](/backend/src/modules/notifications/entities/notification-template.entity.ts) | TypeScript | 33 | 24 | 13 | 70 |
| [backend/src/modules/notifications/notification.controller.ts](/backend/src/modules/notifications/notification.controller.ts) | TypeScript | 109 | 10 | 13 | 132 |
| [backend/src/modules/notifications/notification.module.ts](/backend/src/modules/notifications/notification.module.ts) | TypeScript | 51 | 32 | 2 | 85 |
| [backend/src/modules/notifications/notification.processor.ts](/backend/src/modules/notifications/notification.processor.ts) | TypeScript | 74 | 8 | 18 | 100 |
| [backend/src/modules/notifications/notification.service.ts](/backend/src/modules/notifications/notification.service.ts) | TypeScript | 185 | 28 | 31 | 244 |
| [backend/src/modules/notifications/notification.types.ts](/backend/src/modules/notifications/notification.types.ts) | TypeScript | 27 | 9 | 5 | 41 |
| [backend/src/modules/notifications/providers/\_\_tests\_\_/notification-provider.conformance.spec.ts](/backend/src/modules/notifications/providers/__tests__/notification-provider.conformance.spec.ts) | TypeScript | 138 | 21 | 20 | 179 |
| [backend/src/modules/notifications/providers/cloud-notification.provider.ts](/backend/src/modules/notifications/providers/cloud-notification.provider.ts) | TypeScript | 93 | 28 | 9 | 130 |
| [backend/src/modules/notifications/providers/local-notification.provider.ts](/backend/src/modules/notifications/providers/local-notification.provider.ts) | TypeScript | 50 | 32 | 9 | 91 |
| [backend/src/modules/notifications/providers/whatsapp.transport.ts](/backend/src/modules/notifications/providers/whatsapp.transport.ts) | TypeScript | 15 | 9 | 3 | 27 |
| [backend/src/modules/notifications/whatsapp.service.ts](/backend/src/modules/notifications/whatsapp.service.ts) | TypeScript | 77 | 15 | 11 | 103 |
| [backend/src/modules/platform/feature-flags/decorators/require-feature.decorator.ts](/backend/src/modules/platform/feature-flags/decorators/require-feature.decorator.ts) | TypeScript | 3 | 17 | 3 | 23 |
| [backend/src/modules/platform/feature-flags/dto/upsert-feature-flag.dto.ts](/backend/src/modules/platform/feature-flags/dto/upsert-feature-flag.dto.ts) | TypeScript | 21 | 7 | 6 | 34 |
| [backend/src/modules/platform/feature-flags/entities/feature-flag.entity.ts](/backend/src/modules/platform/feature-flags/entities/feature-flag.entity.ts) | TypeScript | 25 | 29 | 11 | 65 |
| [backend/src/modules/platform/feature-flags/feature-flags-admin.controller.ts](/backend/src/modules/platform/feature-flags/feature-flags-admin.controller.ts) | TypeScript | 33 | 12 | 4 | 49 |
| [backend/src/modules/platform/feature-flags/feature-flags.module.ts](/backend/src/modules/platform/feature-flags/feature-flags.module.ts) | TypeScript | 13 | 8 | 2 | 23 |
| [backend/src/modules/platform/feature-flags/feature-flags.service.ts](/backend/src/modules/platform/feature-flags/feature-flags.service.ts) | TypeScript | 95 | 35 | 18 | 148 |
| [backend/src/modules/platform/feature-flags/guards/require-feature.guard.ts](/backend/src/modules/platform/feature-flags/guards/require-feature.guard.ts) | TypeScript | 28 | 15 | 5 | 48 |
| [backend/src/modules/platform/infrastructure/licensing/license-provider.interface.ts](/backend/src/modules/platform/infrastructure/licensing/license-provider.interface.ts) | TypeScript | 19 | 24 | 2 | 45 |
| [backend/src/modules/platform/infrastructure/notifications/notification-provider.interface.ts](/backend/src/modules/platform/infrastructure/notifications/notification-provider.interface.ts) | TypeScript | 15 | 52 | 8 | 75 |
| [backend/src/modules/platform/infrastructure/notifications/notification-transport.interface.ts](/backend/src/modules/platform/infrastructure/notifications/notification-transport.interface.ts) | TypeScript | 8 | 21 | 1 | 30 |
| [backend/src/modules/platform/infrastructure/oracle/oracle-transport.interface.ts](/backend/src/modules/platform/infrastructure/oracle/oracle-transport.interface.ts) | TypeScript | 18 | 38 | 6 | 62 |
| [backend/src/modules/platform/infrastructure/platform-infrastructure.module.ts](/backend/src/modules/platform/infrastructure/platform-infrastructure.module.ts) | TypeScript | 19 | 4 | 2 | 25 |
| [backend/src/modules/platform/infrastructure/secrets/environment-secrets.provider.ts](/backend/src/modules/platform/infrastructure/secrets/environment-secrets.provider.ts) | TypeScript | 11 | 1 | 3 | 15 |
| [backend/src/modules/platform/infrastructure/secrets/secrets.interface.ts](/backend/src/modules/platform/infrastructure/secrets/secrets.interface.ts) | TypeScript | 3 | 3 | 1 | 7 |
| [backend/src/modules/platform/infrastructure/tokens.ts](/backend/src/modules/platform/infrastructure/tokens.ts) | TypeScript | 6 | 19 | 1 | 26 |
| [backend/src/modules/platform/platform.module.ts](/backend/src/modules/platform/platform.module.ts) | TypeScript | 20 | 0 | 2 | 22 |
| [backend/src/modules/platform/services/ai-platform/adapters/azure-openai.provider.ts](/backend/src/modules/platform/services/ai-platform/adapters/azure-openai.provider.ts) | TypeScript | 43 | 0 | 4 | 47 |
| [backend/src/modules/platform/services/ai-platform/adapters/google-gemini.provider.ts](/backend/src/modules/platform/services/ai-platform/adapters/google-gemini.provider.ts) | TypeScript | 43 | 1 | 4 | 48 |
| [backend/src/modules/platform/services/ai-platform/adapters/ollama.provider.ts](/backend/src/modules/platform/services/ai-platform/adapters/ollama.provider.ts) | TypeScript | 43 | 0 | 4 | 47 |
| [backend/src/modules/platform/services/ai-platform/adapters/openai-compatible.provider.ts](/backend/src/modules/platform/services/ai-platform/adapters/openai-compatible.provider.ts) | TypeScript | 43 | 0 | 4 | 47 |
| [backend/src/modules/platform/services/ai-platform/adapters/openai.provider.ts](/backend/src/modules/platform/services/ai-platform/adapters/openai.provider.ts) | TypeScript | 43 | 0 | 4 | 47 |
| [backend/src/modules/platform/services/ai-platform/administration/ai-administration.facade.ts](/backend/src/modules/platform/services/ai-platform/administration/ai-administration.facade.ts) | TypeScript | 16 | 5 | 7 | 28 |
| [backend/src/modules/platform/services/ai-platform/administration/policy-simulator.service.ts](/backend/src/modules/platform/services/ai-platform/administration/policy-simulator.service.ts) | TypeScript | 21 | 1 | 5 | 27 |
| [backend/src/modules/platform/services/ai-platform/ai-platform.module.ts](/backend/src/modules/platform/services/ai-platform/ai-platform.module.ts) | TypeScript | 57 | 1 | 2 | 60 |
| [backend/src/modules/platform/services/ai-platform/approval/ai-approval-framework.ts](/backend/src/modules/platform/services/ai-platform/approval/ai-approval-framework.ts) | TypeScript | 18 | 0 | 3 | 21 |
| [backend/src/modules/platform/services/ai-platform/audit/audit-replay.service.ts](/backend/src/modules/platform/services/ai-platform/audit/audit-replay.service.ts) | TypeScript | 28 | 3 | 7 | 38 |
| [backend/src/modules/platform/services/ai-platform/capabilities/ai-capability-registry.service.ts](/backend/src/modules/platform/services/ai-platform/capabilities/ai-capability-registry.service.ts) | TypeScript | 30 | 0 | 6 | 36 |
| [backend/src/modules/platform/services/ai-platform/clinical-safety/clinical-safety.engine.ts](/backend/src/modules/platform/services/ai-platform/clinical-safety/clinical-safety.engine.ts) | TypeScript | 44 | 1 | 10 | 55 |
| [backend/src/modules/platform/services/ai-platform/context/ai-context.builder.ts](/backend/src/modules/platform/services/ai-platform/context/ai-context.builder.ts) | TypeScript | 53 | 6 | 9 | 68 |
| [backend/src/modules/platform/services/ai-platform/cost/ai-cost-calculator.service.ts](/backend/src/modules/platform/services/ai-platform/cost/ai-cost-calculator.service.ts) | TypeScript | 17 | 0 | 6 | 23 |
| [backend/src/modules/platform/services/ai-platform/cost/ai-cost-tracker.service.ts](/backend/src/modules/platform/services/ai-platform/cost/ai-cost-tracker.service.ts) | TypeScript | 13 | 4 | 4 | 21 |
| [backend/src/modules/platform/services/ai-platform/cost/ai-rate-limiter.service.ts](/backend/src/modules/platform/services/ai-platform/cost/ai-rate-limiter.service.ts) | TypeScript | 9 | 2 | 3 | 14 |
| [backend/src/modules/platform/services/ai-platform/cost/cost-forecasting.service.ts](/backend/src/modules/platform/services/ai-platform/cost/cost-forecasting.service.ts) | TypeScript | 32 | 0 | 5 | 37 |
| [backend/src/modules/platform/services/ai-platform/cost/pricing.repository.ts](/backend/src/modules/platform/services/ai-platform/cost/pricing.repository.ts) | TypeScript | 32 | 1 | 5 | 38 |
| [backend/src/modules/platform/services/ai-platform/entities/ai-audit-trail.entity.ts](/backend/src/modules/platform/services/ai-platform/entities/ai-audit-trail.entity.ts) | TypeScript | 54 | 2 | 26 | 82 |
| [backend/src/modules/platform/services/ai-platform/entities/ai-traceability.entity.ts](/backend/src/modules/platform/services/ai-platform/entities/ai-traceability.entity.ts) | TypeScript | 19 | 4 | 7 | 30 |
| [backend/src/modules/platform/services/ai-platform/entities/ai-usage.entity.ts](/backend/src/modules/platform/services/ai-platform/entities/ai-usage.entity.ts) | TypeScript | 28 | 0 | 13 | 41 |
| [backend/src/modules/platform/services/ai-platform/entities/prompt-template.entity.ts](/backend/src/modules/platform/services/ai-platform/entities/prompt-template.entity.ts) | TypeScript | 49 | 0 | 23 | 72 |
| [backend/src/modules/platform/services/ai-platform/evaluation/ai-benchmark.framework.ts](/backend/src/modules/platform/services/ai-platform/evaluation/ai-benchmark.framework.ts) | TypeScript | 57 | 1 | 6 | 64 |
| [backend/src/modules/platform/services/ai-platform/evaluation/ai-evaluation-framework.service.ts](/backend/src/modules/platform/services/ai-platform/evaluation/ai-evaluation-framework.service.ts) | TypeScript | 32 | 2 | 6 | 40 |
| [backend/src/modules/platform/services/ai-platform/evaluation/entities/evaluation-dataset.entity.ts](/backend/src/modules/platform/services/ai-platform/evaluation/entities/evaluation-dataset.entity.ts) | TypeScript | 15 | 0 | 3 | 18 |
| [backend/src/modules/platform/services/ai-platform/evaluation/evaluation-dataset.repository.ts](/backend/src/modules/platform/services/ai-platform/evaluation/evaluation-dataset.repository.ts) | TypeScript | 18 | 0 | 5 | 23 |
| [backend/src/modules/platform/services/ai-platform/evaluation/prompt-evaluation.system.ts](/backend/src/modules/platform/services/ai-platform/evaluation/prompt-evaluation.system.ts) | TypeScript | 35 | 1 | 6 | 42 |
| [backend/src/modules/platform/services/ai-platform/exceptions/ai-exceptions.ts](/backend/src/modules/platform/services/ai-platform/exceptions/ai-exceptions.ts) | TypeScript | 42 | 0 | 7 | 49 |
| [backend/src/modules/platform/services/ai-platform/feature-flags/ai-feature-flags.service.ts](/backend/src/modules/platform/services/ai-platform/feature-flags/ai-feature-flags.service.ts) | TypeScript | 16 | 3 | 6 | 25 |
| [backend/src/modules/platform/services/ai-platform/governance/ai-governance-policy.interface.ts](/backend/src/modules/platform/services/ai-platform/governance/ai-governance-policy.interface.ts) | TypeScript | 11 | 4 | 3 | 18 |
| [backend/src/modules/platform/services/ai-platform/governance/ai-request-classification.ts](/backend/src/modules/platform/services/ai-platform/governance/ai-request-classification.ts) | TypeScript | 15 | 0 | 2 | 17 |
| [backend/src/modules/platform/services/ai-platform/governance/governance-simulation.service.ts](/backend/src/modules/platform/services/ai-platform/governance/governance-simulation.service.ts) | TypeScript | 39 | 6 | 7 | 52 |
| [backend/src/modules/platform/services/ai-platform/governance/governance.pipeline.ts](/backend/src/modules/platform/services/ai-platform/governance/governance.pipeline.ts) | TypeScript | 37 | 11 | 8 | 56 |
| [backend/src/modules/platform/services/ai-platform/interfaces/ai-capability.interface.ts](/backend/src/modules/platform/services/ai-platform/interfaces/ai-capability.interface.ts) | TypeScript | 31 | 1 | 5 | 37 |
| [backend/src/modules/platform/services/ai-platform/interfaces/ai-execution.interface.ts](/backend/src/modules/platform/services/ai-platform/interfaces/ai-execution.interface.ts) | TypeScript | 45 | 0 | 6 | 51 |
| [backend/src/modules/platform/services/ai-platform/interfaces/ai-provider.interface.ts](/backend/src/modules/platform/services/ai-platform/interfaces/ai-provider.interface.ts) | TypeScript | 23 | 7 | 5 | 35 |
| [backend/src/modules/platform/services/ai-platform/interfaces/ai-streaming.interface.ts](/backend/src/modules/platform/services/ai-platform/interfaces/ai-streaming.interface.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [backend/src/modules/platform/services/ai-platform/interfaces/ai-token-estimator.interface.ts](/backend/src/modules/platform/services/ai-platform/interfaces/ai-token-estimator.interface.ts) | TypeScript | 3 | 0 | 1 | 4 |
| [backend/src/modules/platform/services/ai-platform/learning/continuous-learning.service.ts](/backend/src/modules/platform/services/ai-platform/learning/continuous-learning.service.ts) | TypeScript | 17 | 5 | 5 | 27 |
| [backend/src/modules/platform/services/ai-platform/operations/ai-operations-dashboard.service.ts](/backend/src/modules/platform/services/ai-platform/operations/ai-operations-dashboard.service.ts) | TypeScript | 22 | 0 | 3 | 25 |
| [backend/src/modules/platform/services/ai-platform/operations/ai-playground.service.ts](/backend/src/modules/platform/services/ai-platform/operations/ai-playground.service.ts) | TypeScript | 23 | 4 | 4 | 31 |
| [backend/src/modules/platform/services/ai-platform/operations/ai-readiness-gate.service.ts](/backend/src/modules/platform/services/ai-platform/operations/ai-readiness-gate.service.ts) | TypeScript | 23 | 1 | 6 | 30 |
| [backend/src/modules/platform/services/ai-platform/operations/ai-release-management.service.ts](/backend/src/modules/platform/services/ai-platform/operations/ai-release-management.service.ts) | TypeScript | 23 | 1 | 5 | 29 |
| [backend/src/modules/platform/services/ai-platform/operations/ai-telemetry.service.ts](/backend/src/modules/platform/services/ai-platform/operations/ai-telemetry.service.ts) | TypeScript | 8 | 1 | 3 | 12 |
| [backend/src/modules/platform/services/ai-platform/operations/provider-health.service.ts](/backend/src/modules/platform/services/ai-platform/operations/provider-health.service.ts) | TypeScript | 26 | 0 | 4 | 30 |
| [backend/src/modules/platform/services/ai-platform/policy/ai-fallback.service.ts](/backend/src/modules/platform/services/ai-platform/policy/ai-fallback.service.ts) | TypeScript | 19 | 7 | 6 | 32 |
| [backend/src/modules/platform/services/ai-platform/policy/ai-operating-mode.policy.ts](/backend/src/modules/platform/services/ai-platform/policy/ai-operating-mode.policy.ts) | TypeScript | 44 | 0 | 3 | 47 |
| [backend/src/modules/platform/services/ai-platform/policy/circuit-breaker.service.ts](/backend/src/modules/platform/services/ai-platform/policy/circuit-breaker.service.ts) | TypeScript | 54 | 2 | 14 | 70 |
| [backend/src/modules/platform/services/ai-platform/policy/model-selection-policy.engine.ts](/backend/src/modules/platform/services/ai-platform/policy/model-selection-policy.engine.ts) | TypeScript | 44 | 7 | 11 | 62 |
| [backend/src/modules/platform/services/ai-platform/policy/retry.policy.ts](/backend/src/modules/platform/services/ai-platform/policy/retry.policy.ts) | TypeScript | 41 | 1 | 9 | 51 |
| [backend/src/modules/platform/services/ai-platform/prompt/prompt-dependency.graph.ts](/backend/src/modules/platform/services/ai-platform/prompt/prompt-dependency.graph.ts) | TypeScript | 24 | 2 | 6 | 32 |
| [backend/src/modules/platform/services/ai-platform/prompt/prompt-manager.service.ts](/backend/src/modules/platform/services/ai-platform/prompt/prompt-manager.service.ts) | TypeScript | 85 | 10 | 18 | 113 |
| [backend/src/modules/platform/services/ai-platform/prompt/prompt-ops.repository.ts](/backend/src/modules/platform/services/ai-platform/prompt/prompt-ops.repository.ts) | TypeScript | 17 | 1 | 6 | 24 |
| [backend/src/modules/platform/services/ai-platform/registries/ai-capability.registry.ts](/backend/src/modules/platform/services/ai-platform/registries/ai-capability.registry.ts) | TypeScript | 25 | 1 | 5 | 31 |
| [backend/src/modules/platform/services/ai-platform/registries/ai-model.registry.ts](/backend/src/modules/platform/services/ai-platform/registries/ai-model.registry.ts) | TypeScript | 37 | 0 | 5 | 42 |
| [backend/src/modules/platform/services/ai-platform/registries/ai-provider.registry.ts](/backend/src/modules/platform/services/ai-platform/registries/ai-provider.registry.ts) | TypeScript | 30 | 0 | 7 | 37 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/azure-openai-sdk.client.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/azure-openai-sdk.client.ts) | TypeScript | 15 | 3 | 7 | 25 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/gemini-sdk.client.integration.spec.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/gemini-sdk.client.integration.spec.ts) | TypeScript | 87 | 1 | 13 | 101 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/gemini-sdk.client.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/gemini-sdk.client.ts) | TypeScript | 52 | 3 | 10 | 65 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/ollama-sdk.client.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/ollama-sdk.client.ts) | TypeScript | 60 | 1 | 11 | 72 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/openai-compatible-sdk.client.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/openai-compatible-sdk.client.ts) | TypeScript | 12 | 0 | 5 | 17 |
| [backend/src/modules/platform/services/ai-platform/sdk-clients/openai-sdk.client.ts](/backend/src/modules/platform/services/ai-platform/sdk-clients/openai-sdk.client.ts) | TypeScript | 50 | 1 | 10 | 61 |
| [backend/src/modules/platform/services/ai-platform/session/ai-session.service.ts](/backend/src/modules/platform/services/ai-platform/session/ai-session.service.ts) | TypeScript | 48 | 1 | 9 | 58 |
| [backend/src/modules/platform/services/ai-platform/testing/ai-capability-certification.spec.ts](/backend/src/modules/platform/services/ai-platform/testing/ai-capability-certification.spec.ts) | TypeScript | 21 | 9 | 9 | 39 |
| [backend/src/modules/platform/services/ai-platform/testing/ai-red-team.spec.ts](/backend/src/modules/platform/services/ai-platform/testing/ai-red-team.spec.ts) | TypeScript | 25 | 1 | 7 | 33 |
| [backend/src/modules/platform/services/ai-platform/testing/certification.framework.ts](/backend/src/modules/platform/services/ai-platform/testing/certification.framework.ts) | TypeScript | 37 | 1 | 5 | 43 |
| [backend/src/modules/platform/services/ai-platform/testing/continuous-regression.pipeline.ts](/backend/src/modules/platform/services/ai-platform/testing/continuous-regression.pipeline.ts) | TypeScript | 13 | 4 | 6 | 23 |
| [backend/src/modules/platform/services/ai-platform/tools/ai-tool.interface.ts](/backend/src/modules/platform/services/ai-platform/tools/ai-tool.interface.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [backend/src/modules/platform/services/ai-platform/tools/tool-executor.ts](/backend/src/modules/platform/services/ai-platform/tools/tool-executor.ts) | TypeScript | 21 | 1 | 6 | 28 |
| [backend/src/modules/platform/services/ai-platform/tools/tool-registry.ts](/backend/src/modules/platform/services/ai-platform/tools/tool-registry.ts) | TypeScript | 25 | 0 | 6 | 31 |
| [backend/src/modules/platform/services/ai-platform/validators/clinical.validator.ts](/backend/src/modules/platform/services/ai-platform/validators/clinical.validator.ts) | TypeScript | 14 | 2 | 3 | 19 |
| [backend/src/modules/platform/services/ai-platform/validators/json-schema.validator.ts](/backend/src/modules/platform/services/ai-platform/validators/json-schema.validator.ts) | TypeScript | 18 | 2 | 4 | 24 |
| [backend/src/modules/platform/services/ai-platform/validators/output-validation-profile.ts](/backend/src/modules/platform/services/ai-platform/validators/output-validation-profile.ts) | TypeScript | 33 | 0 | 3 | 36 |
| [backend/src/modules/platform/services/ai-platform/validators/output-validator.interface.ts](/backend/src/modules/platform/services/ai-platform/validators/output-validator.interface.ts) | TypeScript | 10 | 3 | 3 | 16 |
| [backend/src/modules/platform/services/ai-platform/validators/validation.orchestrator.ts](/backend/src/modules/platform/services/ai-platform/validators/validation.orchestrator.ts) | TypeScript | 33 | 0 | 6 | 39 |
| [backend/src/modules/platform/services/integration/integration-platform.module.ts](/backend/src/modules/platform/services/integration/integration-platform.module.ts) | TypeScript | 7 | 0 | 2 | 9 |
| [backend/src/modules/platform/services/knowledge-search/entities/knowledge-collection.entity.ts](/backend/src/modules/platform/services/knowledge-search/entities/knowledge-collection.entity.ts) | TypeScript | 10 | 0 | 1 | 11 |
| [backend/src/modules/platform/services/knowledge-search/interfaces/knowledge-pipeline.interface.ts](/backend/src/modules/platform/services/knowledge-search/interfaces/knowledge-pipeline.interface.ts) | TypeScript | 36 | 1 | 9 | 46 |
| [backend/src/modules/platform/services/knowledge-search/interfaces/search-provider.interface.ts](/backend/src/modules/platform/services/knowledge-search/interfaces/search-provider.interface.ts) | TypeScript | 20 | 12 | 7 | 39 |
| [backend/src/modules/platform/services/knowledge-search/knowledge-search.module.ts](/backend/src/modules/platform/services/knowledge-search/knowledge-search.module.ts) | TypeScript | 7 | 0 | 2 | 9 |
| [backend/src/modules/platform/services/knowledge-search/services/knowledge-collection.service.ts](/backend/src/modules/platform/services/knowledge-search/services/knowledge-collection.service.ts) | TypeScript | 14 | 0 | 4 | 18 |
| [backend/src/modules/platform/services/knowledge-search/services/knowledge-lifecycle.service.ts](/backend/src/modules/platform/services/knowledge-search/services/knowledge-lifecycle.service.ts) | TypeScript | 25 | 8 | 5 | 38 |
| [backend/src/modules/platform/services/knowledge-search/services/knowledge-platform.service.ts](/backend/src/modules/platform/services/knowledge-search/services/knowledge-platform.service.ts) | TypeScript | 24 | 6 | 9 | 39 |
| [backend/src/modules/platform/services/knowledge-search/services/knowledge-validation.service.ts](/backend/src/modules/platform/services/knowledge-search/services/knowledge-validation.service.ts) | TypeScript | 29 | 1 | 8 | 38 |
| [backend/src/modules/platform/services/object-repository/interfaces/object-storage-provider.interface.ts](/backend/src/modules/platform/services/object-repository/interfaces/object-storage-provider.interface.ts) | TypeScript | 18 | 23 | 7 | 48 |
| [backend/src/modules/platform/services/object-repository/object-repository.module.ts](/backend/src/modules/platform/services/object-repository/object-repository.module.ts) | TypeScript | 30 | 17 | 2 | 49 |
| [backend/src/modules/platform/services/object-repository/providers/\_\_tests\_\_/s3-storage-provider.conformance.spec.ts](/backend/src/modules/platform/services/object-repository/providers/__tests__/s3-storage-provider.conformance.spec.ts) | TypeScript | 60 | 17 | 10 | 87 |
| [backend/src/modules/platform/services/object-repository/providers/local-storage.provider.ts](/backend/src/modules/platform/services/object-repository/providers/local-storage.provider.ts) | TypeScript | 49 | 37 | 10 | 96 |
| [backend/src/modules/platform/services/object-repository/providers/s3-storage.provider.ts](/backend/src/modules/platform/services/object-repository/providers/s3-storage.provider.ts) | TypeScript | 79 | 30 | 11 | 120 |
| [backend/src/modules/platform/services/object-repository/services/object-repository.service.ts](/backend/src/modules/platform/services/object-repository/services/object-repository.service.ts) | TypeScript | 25 | 10 | 7 | 42 |
| [backend/src/modules/platform/services/platform-services.module.ts](/backend/src/modules/platform/services/platform-services.module.ts) | TypeScript | 11 | 5 | 2 | 18 |
| [backend/src/modules/platform/tenant-provisioning/dto/provision-tenant.dto.ts](/backend/src/modules/platform/tenant-provisioning/dto/provision-tenant.dto.ts) | TypeScript | 27 | 11 | 8 | 46 |
| [backend/src/modules/platform/tenant-provisioning/entities/tenant-connector-pairing.entity.ts](/backend/src/modules/platform/tenant-provisioning/entities/tenant-connector-pairing.entity.ts) | TypeScript | 19 | 30 | 8 | 57 |
| [backend/src/modules/platform/tenant-provisioning/entities/tenant-provisioning-run.entity.ts](/backend/src/modules/platform/tenant-provisioning/entities/tenant-provisioning-run.entity.ts) | TypeScript | 35 | 25 | 16 | 76 |
| [backend/src/modules/platform/tenant-provisioning/entities/tenant-provisioning-step.entity.ts](/backend/src/modules/platform/tenant-provisioning/entities/tenant-provisioning-step.entity.ts) | TypeScript | 31 | 10 | 13 | 54 |
| [backend/src/modules/platform/tenant-provisioning/events/tenant-provisioned.event.ts](/backend/src/modules/platform/tenant-provisioning/events/tenant-provisioned.event.ts) | TypeScript | 12 | 12 | 2 | 26 |
| [backend/src/modules/platform/tenant-provisioning/tenant-provisioning.controller.ts](/backend/src/modules/platform/tenant-provisioning/tenant-provisioning.controller.ts) | TypeScript | 40 | 16 | 7 | 63 |
| [backend/src/modules/platform/tenant-provisioning/tenant-provisioning.module.ts](/backend/src/modules/platform/tenant-provisioning/tenant-provisioning.module.ts) | TypeScript | 30 | 12 | 2 | 44 |
| [backend/src/modules/platform/tenant-provisioning/tenant-provisioning.service.ts](/backend/src/modules/platform/tenant-provisioning/tenant-provisioning.service.ts) | TypeScript | 327 | 166 | 52 | 545 |
| [backend/src/modules/platform/tenant/\_\_tests\_\_/tenant-context-interceptor.spec.ts](/backend/src/modules/platform/tenant/__tests__/tenant-context-interceptor.spec.ts) | TypeScript | 47 | 8 | 12 | 67 |
| [backend/src/modules/platform/tenant/\_\_tests\_\_/tenant-context-storage.spec.ts](/backend/src/modules/platform/tenant/__tests__/tenant-context-storage.spec.ts) | TypeScript | 56 | 4 | 10 | 70 |
| [backend/src/modules/platform/tenant/\_\_tests\_\_/tenant-enforcement-canonical.spec.ts](/backend/src/modules/platform/tenant/__tests__/tenant-enforcement-canonical.spec.ts) | TypeScript | 76 | 15 | 21 | 112 |
| [backend/src/modules/platform/tenant/\_\_tests\_\_/tenant-resolvers.spec.ts](/backend/src/modules/platform/tenant/__tests__/tenant-resolvers.spec.ts) | TypeScript | 64 | 9 | 25 | 98 |
| [backend/src/modules/platform/tenant/\_\_tests\_\_/tenant-scoped-repository.spec.ts](/backend/src/modules/platform/tenant/__tests__/tenant-scoped-repository.spec.ts) | TypeScript | 200 | 18 | 64 | 282 |
| [backend/src/modules/platform/tenant/context/tenant-context-storage.ts](/backend/src/modules/platform/tenant/context/tenant-context-storage.ts) | TypeScript | 47 | 47 | 9 | 103 |
| [backend/src/modules/platform/tenant/context/tenant-context.interceptor.ts](/backend/src/modules/platform/tenant/context/tenant-context.interceptor.ts) | TypeScript | 32 | 47 | 6 | 85 |
| [backend/src/modules/platform/tenant/context/tenant-scope.interface.ts](/backend/src/modules/platform/tenant/context/tenant-scope.interface.ts) | TypeScript | 4 | 24 | 2 | 30 |
| [backend/src/modules/platform/tenant/entities/tenant.entity.ts](/backend/src/modules/platform/tenant/entities/tenant.entity.ts) | TypeScript | 22 | 17 | 9 | 48 |
| [backend/src/modules/platform/tenant/repositories/tenant-scoped-repository.provider.ts](/backend/src/modules/platform/tenant/repositories/tenant-scoped-repository.provider.ts) | TypeScript | 19 | 16 | 3 | 38 |
| [backend/src/modules/platform/tenant/repositories/tenant-scoped.repository.ts](/backend/src/modules/platform/tenant/repositories/tenant-scoped.repository.ts) | TypeScript | 267 | 86 | 30 | 383 |
| [backend/src/modules/platform/tenant/resolvers/chain-tenant.resolver.ts](/backend/src/modules/platform/tenant/resolvers/chain-tenant.resolver.ts) | TypeScript | 9 | 24 | 3 | 36 |
| [backend/src/modules/platform/tenant/resolvers/oracle-tenant.resolver.ts](/backend/src/modules/platform/tenant/resolvers/oracle-tenant.resolver.ts) | TypeScript | 9 | 23 | 3 | 35 |
| [backend/src/modules/platform/tenant/resolvers/session-tenant.resolver.ts](/backend/src/modules/platform/tenant/resolvers/session-tenant.resolver.ts) | TypeScript | 15 | 27 | 4 | 46 |
| [backend/src/modules/platform/tenant/tenant-context.service.ts](/backend/src/modules/platform/tenant/tenant-context.service.ts) | TypeScript | 45 | 56 | 10 | 111 |
| [backend/src/modules/platform/tenant/tenant.module.ts](/backend/src/modules/platform/tenant/tenant.module.ts) | TypeScript | 30 | 22 | 2 | 54 |
| [backend/src/modules/rbac/dto/create-role.dto.ts](/backend/src/modules/rbac/dto/create-role.dto.ts) | TypeScript | 45 | 0 | 8 | 53 |
| [backend/src/modules/rbac/entities/permission.entity.ts](/backend/src/modules/rbac/entities/permission.entity.ts) | TypeScript | 24 | 6 | 9 | 39 |
| [backend/src/modules/rbac/entities/role.entity.ts](/backend/src/modules/rbac/entities/role.entity.ts) | TypeScript | 31 | 5 | 10 | 46 |
| [backend/src/modules/rbac/permissions.service.ts](/backend/src/modules/rbac/permissions.service.ts) | TypeScript | 31 | 8 | 6 | 45 |
| [backend/src/modules/rbac/rbac.controller.ts](/backend/src/modules/rbac/rbac.controller.ts) | TypeScript | 74 | 3 | 10 | 87 |
| [backend/src/modules/rbac/rbac.module.ts](/backend/src/modules/rbac/rbac.module.ts) | TypeScript | 26 | 9 | 2 | 37 |
| [backend/src/modules/rbac/roles.service.ts](/backend/src/modules/rbac/roles.service.ts) | TypeScript | 114 | 13 | 23 | 150 |
| [backend/src/modules/reports/reports.controller.ts](/backend/src/modules/reports/reports.controller.ts) | TypeScript | 104 | 1 | 12 | 117 |
| [backend/src/modules/reports/reports.module.ts](/backend/src/modules/reports/reports.module.ts) | TypeScript | 24 | 0 | 2 | 26 |
| [backend/src/modules/reports/reports.service.ts](/backend/src/modules/reports/reports.service.ts) | TypeScript | 261 | 8 | 30 | 299 |
| [backend/src/modules/reports/reports.types.ts](/backend/src/modules/reports/reports.types.ts) | TypeScript | 58 | 1 | 7 | 66 |
| [backend/src/modules/settings/entities/system-setting.entity.ts](/backend/src/modules/settings/entities/system-setting.entity.ts) | TypeScript | 18 | 12 | 7 | 37 |
| [backend/src/modules/settings/settings.controller.ts](/backend/src/modules/settings/settings.controller.ts) | TypeScript | 16 | 0 | 3 | 19 |
| [backend/src/modules/settings/settings.module.ts](/backend/src/modules/settings/settings.module.ts) | TypeScript | 12 | 0 | 2 | 14 |
| [backend/src/modules/settings/settings.service.ts](/backend/src/modules/settings/settings.service.ts) | TypeScript | 31 | 0 | 6 | 37 |
| [backend/src/modules/token/analytics/token-analytics.controller.ts](/backend/src/modules/token/analytics/token-analytics.controller.ts) | TypeScript | 115 | 10 | 14 | 139 |
| [backend/src/modules/token/analytics/token-analytics.service.ts](/backend/src/modules/token/analytics/token-analytics.service.ts) | TypeScript | 326 | 51 | 20 | 397 |
| [backend/src/modules/token/audit/token-audit.service.ts](/backend/src/modules/token/audit/token-audit.service.ts) | TypeScript | 64 | 10 | 9 | 83 |
| [backend/src/modules/token/config/token-config.controller.ts](/backend/src/modules/token/config/token-config.controller.ts) | TypeScript | 148 | 31 | 23 | 202 |
| [backend/src/modules/token/config/token-config.service.ts](/backend/src/modules/token/config/token-config.service.ts) | TypeScript | 246 | 33 | 43 | 322 |
| [backend/src/modules/token/display/display.controller.ts](/backend/src/modules/token/display/display.controller.ts) | TypeScript | 49 | 15 | 7 | 71 |
| [backend/src/modules/token/display/display.service.ts](/backend/src/modules/token/display/display.service.ts) | TypeScript | 69 | 12 | 14 | 95 |
| [backend/src/modules/token/dto/call-token.dto.ts](/backend/src/modules/token/dto/call-token.dto.ts) | TypeScript | 9 | 0 | 3 | 12 |
| [backend/src/modules/token/dto/upsert-counter.dto.ts](/backend/src/modules/token/dto/upsert-counter.dto.ts) | TypeScript | 28 | 0 | 6 | 34 |
| [backend/src/modules/token/entities/display-page.entity.ts](/backend/src/modules/token/entities/display-page.entity.ts) | TypeScript | 25 | 25 | 10 | 60 |
| [backend/src/modules/token/entities/token-analytics-daily.entity.ts](/backend/src/modules/token/entities/token-analytics-daily.entity.ts) | TypeScript | 42 | 19 | 20 | 81 |
| [backend/src/modules/token/entities/token-audit-log.entity.ts](/backend/src/modules/token/entities/token-audit-log.entity.ts) | TypeScript | 29 | 19 | 14 | 62 |
| [backend/src/modules/token/entities/token-branch-config.entity.ts](/backend/src/modules/token/entities/token-branch-config.entity.ts) | TypeScript | 26 | 12 | 11 | 49 |
| [backend/src/modules/token/entities/token-call.entity.ts](/backend/src/modules/token/entities/token-call.entity.ts) | TypeScript | 40 | 27 | 18 | 85 |
| [backend/src/modules/token/entities/token-counter.entity.ts](/backend/src/modules/token/entities/token-counter.entity.ts) | TypeScript | 29 | 12 | 10 | 51 |
| [backend/src/modules/token/entities/token-kiosk-assignment.entity.ts](/backend/src/modules/token/entities/token-kiosk-assignment.entity.ts) | TypeScript | 48 | 20 | 20 | 88 |
| [backend/src/modules/token/entities/token-kiosk-branding.entity.ts](/backend/src/modules/token/entities/token-kiosk-branding.entity.ts) | TypeScript | 33 | 15 | 16 | 64 |
| [backend/src/modules/token/entities/token-kiosk.entity.ts](/backend/src/modules/token/entities/token-kiosk.entity.ts) | TypeScript | 39 | 20 | 17 | 76 |
| [backend/src/modules/token/entities/token-location.entity.ts](/backend/src/modules/token/entities/token-location.entity.ts) | TypeScript | 40 | 18 | 17 | 75 |
| [backend/src/modules/token/entities/token-record.entity.ts](/backend/src/modules/token/entities/token-record.entity.ts) | TypeScript | 77 | 35 | 34 | 146 |
| [backend/src/modules/token/entities/token-sc-config.entity.ts](/backend/src/modules/token/entities/token-sc-config.entity.ts) | TypeScript | 37 | 21 | 16 | 74 |
| [backend/src/modules/token/entities/token-sequence.entity.ts](/backend/src/modules/token/entities/token-sequence.entity.ts) | TypeScript | 21 | 24 | 10 | 55 |
| [backend/src/modules/token/kiosk/token-kiosk.controller.ts](/backend/src/modules/token/kiosk/token-kiosk.controller.ts) | TypeScript | 251 | 43 | 32 | 326 |
| [backend/src/modules/token/kiosk/token-kiosk.service.ts](/backend/src/modules/token/kiosk/token-kiosk.service.ts) | TypeScript | 492 | 91 | 77 | 660 |
| [backend/src/modules/token/queue/token-daily-reset.service.ts](/backend/src/modules/token/queue/token-daily-reset.service.ts) | TypeScript | 129 | 29 | 30 | 188 |
| [backend/src/modules/token/queue/token-queue.controller.ts](/backend/src/modules/token/queue/token-queue.controller.ts) | TypeScript | 212 | 32 | 25 | 269 |
| [backend/src/modules/token/queue/token-queue.service.ts](/backend/src/modules/token/queue/token-queue.service.ts) | TypeScript | 269 | 65 | 44 | 378 |
| [backend/src/modules/token/queue/token-sequence.service.ts](/backend/src/modules/token/queue/token-sequence.service.ts) | TypeScript | 250 | 85 | 43 | 378 |
| [backend/src/modules/token/registration/\_\_tests\_\_/registration.service.spec.ts](/backend/src/modules/token/registration/__tests__/registration.service.spec.ts) | TypeScript | 273 | 5 | 41 | 319 |
| [backend/src/modules/token/registration/dto/map-patient.dto.ts](/backend/src/modules/token/registration/dto/map-patient.dto.ts) | TypeScript | 40 | 22 | 10 | 72 |
| [backend/src/modules/token/registration/dto/reserve-token.dto.ts](/backend/src/modules/token/registration/dto/reserve-token.dto.ts) | TypeScript | 21 | 1 | 6 | 28 |
| [backend/src/modules/token/registration/entities/mapping-audit-log.entity.ts](/backend/src/modules/token/registration/entities/mapping-audit-log.entity.ts) | TypeScript | 46 | 17 | 15 | 78 |
| [backend/src/modules/token/registration/entities/token-patient-mapping.entity.ts](/backend/src/modules/token/registration/entities/token-patient-mapping.entity.ts) | TypeScript | 41 | 22 | 17 | 80 |
| [backend/src/modules/token/registration/entities/token-reservation.entity.ts](/backend/src/modules/token/registration/entities/token-reservation.entity.ts) | TypeScript | 33 | 25 | 14 | 72 |
| [backend/src/modules/token/registration/registration.controller.ts](/backend/src/modules/token/registration/registration.controller.ts) | TypeScript | 155 | 95 | 20 | 270 |
| [backend/src/modules/token/registration/registration.module.ts](/backend/src/modules/token/registration/registration.module.ts) | TypeScript | 41 | 10 | 6 | 57 |
| [backend/src/modules/token/registration/registration.service.ts](/backend/src/modules/token/registration/registration.service.ts) | TypeScript | 490 | 165 | 100 | 755 |
| [backend/src/modules/token/token.controller.ts](/backend/src/modules/token/token.controller.ts) | TypeScript | 320 | 43 | 48 | 411 |
| [backend/src/modules/token/token.gateway.ts](/backend/src/modules/token/token.gateway.ts) | TypeScript | 339 | 94 | 58 | 491 |
| [backend/src/modules/token/token.module.ts](/backend/src/modules/token/token.module.ts) | TypeScript | 95 | 18 | 11 | 124 |
| [backend/src/modules/token/token.service.ts](/backend/src/modules/token/token.service.ts) | TypeScript | 1,009 | 231 | 133 | 1,373 |
| [backend/src/modules/token/workstation/dto/save-workstation-config.dto.ts](/backend/src/modules/token/workstation/dto/save-workstation-config.dto.ts) | TypeScript | 22 | 15 | 6 | 43 |
| [backend/src/modules/token/workstation/entities/workstation-config.entity.ts](/backend/src/modules/token/workstation/entities/workstation-config.entity.ts) | TypeScript | 32 | 47 | 13 | 92 |
| [backend/src/modules/token/workstation/workstation.controller.ts](/backend/src/modules/token/workstation/workstation.controller.ts) | TypeScript | 62 | 42 | 14 | 118 |
| [backend/src/modules/token/workstation/workstation.module.ts](/backend/src/modules/token/workstation/workstation.module.ts) | TypeScript | 29 | 6 | 4 | 39 |
| [backend/src/modules/token/workstation/workstation.service.ts](/backend/src/modules/token/workstation/workstation.service.ts) | TypeScript | 177 | 46 | 33 | 256 |
| [backend/src/modules/users/\_\_tests\_\_/users.service.spec.ts](/backend/src/modules/users/__tests__/users.service.spec.ts) | TypeScript | 52 | 0 | 10 | 62 |
| [backend/src/modules/users/dto/create-user.dto.ts](/backend/src/modules/users/dto/create-user.dto.ts) | TypeScript | 76 | 0 | 14 | 90 |
| [backend/src/modules/users/dto/update-user.dto.ts](/backend/src/modules/users/dto/update-user.dto.ts) | TypeScript | 19 | 2 | 3 | 24 |
| [backend/src/modules/users/entities/user.entity.ts](/backend/src/modules/users/entities/user.entity.ts) | TypeScript | 97 | 9 | 28 | 134 |
| [backend/src/modules/users/users.controller.ts](/backend/src/modules/users/users.controller.ts) | TypeScript | 119 | 16 | 11 | 146 |
| [backend/src/modules/users/users.module.ts](/backend/src/modules/users/users.module.ts) | TypeScript | 24 | 9 | 2 | 35 |
| [backend/src/modules/users/users.service.ts](/backend/src/modules/users/users.service.ts) | TypeScript | 225 | 45 | 35 | 305 |
| [backend/src/modules/vendor-administration/controllers/vendor-command.controller.ts](/backend/src/modules/vendor-administration/controllers/vendor-command.controller.ts) | TypeScript | 59 | 0 | 6 | 65 |
| [backend/src/modules/vendor-administration/controllers/vendor-query.controller.ts](/backend/src/modules/vendor-administration/controllers/vendor-query.controller.ts) | TypeScript | 34 | 0 | 5 | 39 |
| [backend/src/modules/vendor-administration/guards/vendor-hmac.guard.ts](/backend/src/modules/vendor-administration/guards/vendor-hmac.guard.ts) | TypeScript | 62 | 7 | 18 | 87 |
| [backend/src/modules/vendor-administration/services/account-lock-management.service.ts](/backend/src/modules/vendor-administration/services/account-lock-management.service.ts) | TypeScript | 147 | 4 | 24 | 175 |
| [backend/src/modules/vendor-administration/services/command-dispatcher.service.ts](/backend/src/modules/vendor-administration/services/command-dispatcher.service.ts) | TypeScript | 80 | 2 | 9 | 91 |
| [backend/src/modules/vendor-administration/vendor-administration.module.ts](/backend/src/modules/vendor-administration/vendor-administration.module.ts) | TypeScript | 28 | 0 | 2 | 30 |
| [backend/src/scripts/provision-self-hosted.ts](/backend/src/scripts/provision-self-hosted.ts) | TypeScript | 54 | 23 | 11 | 88 |
| [backend/tsconfig-attendance-only.json](/backend/tsconfig-attendance-only.json) | JSON | 9 | 0 | 1 | 10 |
| [backend/tsconfig.build.json](/backend/tsconfig.build.json) | JSON | 13 | 0 | 1 | 14 |
| [backend/tsconfig.json](/backend/tsconfig.json) | JSON with Comments | 36 | 0 | 1 | 37 |
| [frontend/lib/dummy-module.js](/frontend/lib/dummy-module.js) | JavaScript | -9 | -1 | -2 | -12 |
| [frontend/next-env.d.ts](/frontend/next-env.d.ts) | TypeScript | 0 | -4 | -2 | -6 |
| [frontend/next.config.mjs](/frontend/next.config.mjs) | JavaScript | -101 | -18 | -13 | -132 |
| [frontend/package-lock.json](/frontend/package-lock.json) | JSON | -7,999 | 0 | -1 | -8,000 |
| [frontend/package.json](/frontend/package.json) | JSON | -54 | 0 | -1 | -55 |
| [frontend/public/logo-full.svg](/frontend/public/logo-full.svg) | XML | -15,787 | 0 | -90 | -15,877 |
| [frontend/public/logo-icon.svg](/frontend/public/logo-icon.svg) | XML | -11,196 | 0 | -52 | -11,248 |
| [frontend/src/app/(auth)/change-password/page.tsx](/frontend/src/app/(auth)/change-password/page.tsx) | TypeScript JSX | -169 | 0 | -15 | -184 |
| [frontend/src/app/(auth)/login/page.tsx](/frontend/src/app/(auth)/login/page.tsx) | TypeScript JSX | -801 | -55 | -46 | -902 |
| [frontend/src/app/(auth)/setup/page.tsx](/frontend/src/app/(auth)/setup/page.tsx) | TypeScript JSX | -202 | -4 | -20 | -226 |
| [frontend/src/app/(platform)/attendance/monitoring/page.tsx](/frontend/src/app/(platform)/attendance/monitoring/page.tsx) | TypeScript JSX | -424 | 0 | -26 | -450 |
| [frontend/src/app/(platform)/cms/displays/page.tsx](/frontend/src/app/(platform)/cms/displays/page.tsx) | TypeScript JSX | -870 | -20 | -74 | -964 |
| [frontend/src/app/(platform)/cms/emergency/page.tsx](/frontend/src/app/(platform)/cms/emergency/page.tsx) | TypeScript JSX | -136 | 0 | -16 | -152 |
| [frontend/src/app/(platform)/cms/groups/page.tsx](/frontend/src/app/(platform)/cms/groups/page.tsx) | TypeScript JSX | -135 | 0 | -19 | -154 |
| [frontend/src/app/(platform)/cms/media/page.tsx](/frontend/src/app/(platform)/cms/media/page.tsx) | TypeScript JSX | -294 | -2 | -23 | -319 |
| [frontend/src/app/(platform)/cms/monitoring/page.tsx](/frontend/src/app/(platform)/cms/monitoring/page.tsx) | TypeScript JSX | -245 | -1 | -24 | -270 |
| [frontend/src/app/(platform)/cms/playlists/\[id\]/page.tsx](/frontend/src/app/(platform)/cms/playlists/%5Bid%5D/page.tsx) | TypeScript JSX | -612 | -14 | -52 | -678 |
| [frontend/src/app/(platform)/cms/playlists/page.tsx](/frontend/src/app/(platform)/cms/playlists/page.tsx) | TypeScript JSX | -149 | 0 | -13 | -162 |
| [frontend/src/app/(platform)/cms/settings/page.tsx](/frontend/src/app/(platform)/cms/settings/page.tsx) | TypeScript JSX | -107 | 0 | -14 | -121 |
| [frontend/src/app/(platform)/dashboard/page.tsx](/frontend/src/app/(platform)/dashboard/page.tsx) | TypeScript JSX | -634 | -23 | -36 | -693 |
| [frontend/src/app/(platform)/eic/assessments/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/assessments/%5Bid%5D/page.tsx) | TypeScript JSX | -808 | -19 | -81 | -908 |
| [frontend/src/app/(platform)/eic/assessments/page.tsx](/frontend/src/app/(platform)/eic/assessments/page.tsx) | TypeScript JSX | -267 | -3 | -24 | -294 |
| [frontend/src/app/(platform)/eic/discharge/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/discharge/%5Bid%5D/page.tsx) | TypeScript JSX | -455 | -3 | -17 | -475 |
| [frontend/src/app/(platform)/eic/enrollments/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/enrollments/%5Bid%5D/page.tsx) | TypeScript JSX | -1,161 | -23 | -58 | -1,242 |
| [frontend/src/app/(platform)/eic/enrollments/new/page.tsx](/frontend/src/app/(platform)/eic/enrollments/new/page.tsx) | TypeScript JSX | -242 | -6 | -24 | -272 |
| [frontend/src/app/(platform)/eic/layout.tsx](/frontend/src/app/(platform)/eic/layout.tsx) | TypeScript JSX | -9 | 0 | -3 | -12 |
| [frontend/src/app/(platform)/eic/page.tsx](/frontend/src/app/(platform)/eic/page.tsx) | TypeScript JSX | -101 | -1 | -8 | -110 |
| [frontend/src/app/(platform)/eic/patients/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/patients/%5Bid%5D/page.tsx) | TypeScript JSX | -368 | -12 | -30 | -410 |
| [frontend/src/app/(platform)/eic/patients/new/page.tsx](/frontend/src/app/(platform)/eic/patients/new/page.tsx) | TypeScript JSX | -210 | -4 | -21 | -235 |
| [frontend/src/app/(platform)/eic/patients/page.tsx](/frontend/src/app/(platform)/eic/patients/page.tsx) | TypeScript JSX | -235 | -2 | -12 | -249 |
| [frontend/src/app/(platform)/eic/patients/search/page.tsx](/frontend/src/app/(platform)/eic/patients/search/page.tsx) | TypeScript JSX | -248 | -8 | -25 | -281 |
| [frontend/src/app/(platform)/eic/preschool/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/preschool/%5Bid%5D/page.tsx) | TypeScript JSX | -813 | -35 | -76 | -924 |
| [frontend/src/app/(platform)/eic/preschool/new/page.tsx](/frontend/src/app/(platform)/eic/preschool/new/page.tsx) | TypeScript JSX | -278 | -7 | -28 | -313 |
| [frontend/src/app/(platform)/eic/preschool/page.tsx](/frontend/src/app/(platform)/eic/preschool/page.tsx) | TypeScript JSX | -164 | -2 | -14 | -180 |
| [frontend/src/app/(platform)/eic/progress-reports/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/progress-reports/%5Bid%5D/page.tsx) | TypeScript JSX | -487 | -7 | -36 | -530 |
| [frontend/src/app/(platform)/eic/progress-reports/page.tsx](/frontend/src/app/(platform)/eic/progress-reports/page.tsx) | TypeScript JSX | -311 | -20 | -36 | -367 |
| [frontend/src/app/(platform)/eic/sessions/\[id\]/page.tsx](/frontend/src/app/(platform)/eic/sessions/%5Bid%5D/page.tsx) | TypeScript JSX | -406 | -20 | -35 | -461 |
| [frontend/src/app/(platform)/eic/sessions/page.tsx](/frontend/src/app/(platform)/eic/sessions/page.tsx) | TypeScript JSX | -220 | -2 | -19 | -241 |
| [frontend/src/app/(platform)/eic/sync/page.tsx](/frontend/src/app/(platform)/eic/sync/page.tsx) | TypeScript JSX | -429 | -9 | -33 | -471 |
| [frontend/src/app/(platform)/feedback/analytics/page.tsx](/frontend/src/app/(platform)/feedback/analytics/page.tsx) | TypeScript JSX | -251 | -6 | -18 | -275 |
| [frontend/src/app/(platform)/feedback/campaigns/page.tsx](/frontend/src/app/(platform)/feedback/campaigns/page.tsx) | TypeScript JSX | -274 | -3 | -23 | -300 |
| [frontend/src/app/(platform)/feedback/complaints/page.tsx](/frontend/src/app/(platform)/feedback/complaints/page.tsx) | TypeScript JSX | -275 | -8 | -23 | -306 |
| [frontend/src/app/(platform)/feedback/forms/\[id\]/page.tsx](/frontend/src/app/(platform)/feedback/forms/%5Bid%5D/page.tsx) | TypeScript JSX | -775 | -48 | -88 | -911 |
| [frontend/src/app/(platform)/feedback/forms/page.tsx](/frontend/src/app/(platform)/feedback/forms/page.tsx) | TypeScript JSX | -203 | 0 | -18 | -221 |
| [frontend/src/app/(platform)/feedback/languages/page.tsx](/frontend/src/app/(platform)/feedback/languages/page.tsx) | TypeScript JSX | -87 | -6 | -13 | -106 |
| [frontend/src/app/(platform)/feedback/qr-codes/page.tsx](/frontend/src/app/(platform)/feedback/qr-codes/page.tsx) | TypeScript JSX | -238 | -5 | -27 | -270 |
| [frontend/src/app/(platform)/feedback/responses/page.tsx](/frontend/src/app/(platform)/feedback/responses/page.tsx) | TypeScript JSX | -101 | -7 | -13 | -121 |
| [frontend/src/app/(platform)/feedback/settings/page.tsx](/frontend/src/app/(platform)/feedback/settings/page.tsx) | TypeScript JSX | -163 | -14 | -19 | -196 |
| [frontend/src/app/(platform)/forms/designer/\[documentId\]/page.tsx](/frontend/src/app/(platform)/forms/designer/%5BdocumentId%5D/page.tsx) | TypeScript JSX | -195 | -32 | -28 | -255 |
| [frontend/src/app/(platform)/forms/designer/page.tsx](/frontend/src/app/(platform)/forms/designer/page.tsx) | TypeScript JSX | -148 | -8 | -12 | -168 |
| [frontend/src/app/(platform)/forms/designer/templates/page.tsx](/frontend/src/app/(platform)/forms/designer/templates/page.tsx) | TypeScript JSX | -123 | -8 | -12 | -143 |
| [frontend/src/app/(platform)/forms/import/page.tsx](/frontend/src/app/(platform)/forms/import/page.tsx) | TypeScript JSX | -426 | -42 | -55 | -523 |
| [frontend/src/app/(platform)/layout.tsx](/frontend/src/app/(platform)/layout.tsx) | TypeScript JSX | -617 | -31 | -44 | -692 |
| [frontend/src/app/(platform)/loyalty/accounts/\[id\]/page.tsx](/frontend/src/app/(platform)/loyalty/accounts/%5Bid%5D/page.tsx) | TypeScript JSX | -398 | -11 | -26 | -435 |
| [frontend/src/app/(platform)/loyalty/campaigns/page.tsx](/frontend/src/app/(platform)/loyalty/campaigns/page.tsx) | TypeScript JSX | -483 | -10 | -33 | -526 |
| [frontend/src/app/(platform)/loyalty/earn/page.tsx](/frontend/src/app/(platform)/loyalty/earn/page.tsx) | TypeScript JSX | -251 | -3 | -22 | -276 |
| [frontend/src/app/(platform)/loyalty/enroll/page.tsx](/frontend/src/app/(platform)/loyalty/enroll/page.tsx) | TypeScript JSX | -190 | -6 | -18 | -214 |
| [frontend/src/app/(platform)/loyalty/page.tsx](/frontend/src/app/(platform)/loyalty/page.tsx) | TypeScript JSX | -621 | -26 | -50 | -697 |
| [frontend/src/app/(platform)/notifications/page.tsx](/frontend/src/app/(platform)/notifications/page.tsx) | TypeScript JSX | -401 | -8 | -33 | -442 |
| [frontend/src/app/(platform)/rbac/page.tsx](/frontend/src/app/(platform)/rbac/page.tsx) | TypeScript JSX | -243 | -9 | -19 | -271 |
| [frontend/src/app/(platform)/reports/page.tsx](/frontend/src/app/(platform)/reports/page.tsx) | TypeScript JSX | -351 | -8 | -19 | -378 |
| [frontend/src/app/(platform)/security/password-reset-requests/page.tsx](/frontend/src/app/(platform)/security/password-reset-requests/page.tsx) | TypeScript JSX | -447 | -11 | -32 | -490 |
| [frontend/src/app/(platform)/settings/card-config/page.tsx](/frontend/src/app/(platform)/settings/card-config/page.tsx) | TypeScript JSX | -347 | -12 | -28 | -387 |
| [frontend/src/app/(platform)/settings/license/page.tsx](/frontend/src/app/(platform)/settings/license/page.tsx) | TypeScript JSX | -815 | -28 | -52 | -895 |
| [frontend/src/app/(platform)/settings/page.tsx](/frontend/src/app/(platform)/settings/page.tsx) | TypeScript JSX | -4 | 0 | -2 | -6 |
| [frontend/src/app/(platform)/token/config/kiosks/page.tsx](/frontend/src/app/(platform)/token/config/kiosks/page.tsx) | TypeScript JSX | -422 | -24 | -39 | -485 |
| [frontend/src/app/(platform)/token/config/page.tsx](/frontend/src/app/(platform)/token/config/page.tsx) | TypeScript JSX | -440 | -8 | -30 | -478 |
| [frontend/src/app/(platform)/token/config/sc-configs/page.tsx](/frontend/src/app/(platform)/token/config/sc-configs/page.tsx) | TypeScript JSX | -412 | -7 | -40 | -459 |
| [frontend/src/app/(platform)/token/layout.tsx](/frontend/src/app/(platform)/token/layout.tsx) | TypeScript JSX | -7 | 0 | -3 | -10 |
| [frontend/src/app/(platform)/token/loading.tsx](/frontend/src/app/(platform)/token/loading.tsx) | TypeScript JSX | -9 | -6 | -2 | -17 |
| [frontend/src/app/(platform)/token/page.tsx](/frontend/src/app/(platform)/token/page.tsx) | TypeScript JSX | -1,071 | -153 | -115 | -1,339 |
| [frontend/src/app/(platform)/token/print-config/page.tsx](/frontend/src/app/(platform)/token/print-config/page.tsx) | TypeScript JSX | -248 | -1 | -29 | -278 |
| [frontend/src/app/(platform)/users/page.tsx](/frontend/src/app/(platform)/users/page.tsx) | TypeScript JSX | -728 | -31 | -44 | -803 |
| [frontend/src/app/cms/player/\[slug\]/content-renderers.tsx](/frontend/src/app/cms/player/%5Bslug%5D/content-renderers.tsx) | TypeScript JSX | -22 | -18 | -7 | -47 |
| [frontend/src/app/cms/player/\[slug\]/page.tsx](/frontend/src/app/cms/player/%5Bslug%5D/page.tsx) | TypeScript JSX | -342 | -56 | -46 | -444 |
| [frontend/src/app/cms/player/\[slug\]/player-cache.ts](/frontend/src/app/cms/player/%5Bslug%5D/player-cache.ts) | TypeScript | -89 | -26 | -14 | -129 |
| [frontend/src/app/cms/player/\[slug\]/player-log.ts](/frontend/src/app/cms/player/%5Bslug%5D/player-log.ts) | TypeScript | -40 | -9 | -9 | -58 |
| [frontend/src/app/cms/player/\[slug\]/player-storage.ts](/frontend/src/app/cms/player/%5Bslug%5D/player-storage.ts) | TypeScript | -38 | -12 | -7 | -57 |
| [frontend/src/app/cms/player/\[slug\]/renderers/image.plugin.tsx](/frontend/src/app/cms/player/%5Bslug%5D/renderers/image.plugin.tsx) | TypeScript JSX | -26 | -2 | -5 | -33 |
| [frontend/src/app/cms/player/\[slug\]/renderers/plugin-types.ts](/frontend/src/app/cms/player/%5Bslug%5D/renderers/plugin-types.ts) | TypeScript | -43 | -28 | -8 | -79 |
| [frontend/src/app/cms/player/\[slug\]/renderers/queue-widget.plugin.tsx](/frontend/src/app/cms/player/%5Bslug%5D/renderers/queue-widget.plugin.tsx) | TypeScript JSX | -144 | -15 | -17 | -176 |
| [frontend/src/app/cms/player/\[slug\]/renderers/registry.ts](/frontend/src/app/cms/player/%5Bslug%5D/renderers/registry.ts) | TypeScript | -22 | -2 | -7 | -31 |
| [frontend/src/app/cms/player/\[slug\]/renderers/video.plugin.tsx](/frontend/src/app/cms/player/%5Bslug%5D/renderers/video.plugin.tsx) | TypeScript JSX | -26 | 0 | -5 | -31 |
| [frontend/src/app/cms/player/\[slug\]/ticker-overlay.tsx](/frontend/src/app/cms/player/%5Bslug%5D/ticker-overlay.tsx) | TypeScript JSX | -81 | -21 | -13 | -115 |
| [frontend/src/app/dev/canvas-sandbox/page.tsx](/frontend/src/app/dev/canvas-sandbox/page.tsx) | TypeScript JSX | -30 | -19 | -6 | -55 |
| [frontend/src/app/dev/form-designer-sandbox/page.tsx](/frontend/src/app/dev/form-designer-sandbox/page.tsx) | TypeScript JSX | -113 | -19 | -16 | -148 |
| [frontend/src/app/display/\[slug\]/layout.tsx](/frontend/src/app/display/%5Bslug%5D/layout.tsx) | TypeScript JSX | -8 | -4 | -2 | -14 |
| [frontend/src/app/display/\[slug\]/page.tsx](/frontend/src/app/display/%5Bslug%5D/page.tsx) | TypeScript JSX | -253 | -21 | -35 | -309 |
| [frontend/src/app/feedback/f/\[token\]/page.tsx](/frontend/src/app/feedback/f/%5Btoken%5D/page.tsx) | TypeScript JSX | -593 | -71 | -63 | -727 |
| [frontend/src/app/kiosk/\[slug\]/page.tsx](/frontend/src/app/kiosk/%5Bslug%5D/page.tsx) | TypeScript JSX | -541 | -70 | -53 | -664 |
| [frontend/src/app/kiosk/layout.tsx](/frontend/src/app/kiosk/layout.tsx) | TypeScript JSX | -8 | 0 | -2 | -10 |
| [frontend/src/app/layout.tsx](/frontend/src/app/layout.tsx) | TypeScript JSX | -39 | 0 | -4 | -43 |
| [frontend/src/app/page.tsx](/frontend/src/app/page.tsx) | TypeScript JSX | -4 | -4 | -2 | -10 |
| [frontend/src/app/token/display-config/page.tsx](/frontend/src/app/token/display-config/page.tsx) | TypeScript JSX | -937 | -44 | -71 | -1,052 |
| [frontend/src/app/token/display-config/renderer.tsx](/frontend/src/app/token/display-config/renderer.tsx) | TypeScript JSX | -263 | 0 | -19 | -282 |
| [frontend/src/app/token/display-config/types.ts](/frontend/src/app/token/display-config/types.ts) | TypeScript | -123 | -8 | -9 | -140 |
| [frontend/src/app/token/display-pages/page.tsx](/frontend/src/app/token/display-pages/page.tsx) | TypeScript JSX | -305 | -20 | -33 | -358 |
| [frontend/src/app/token/display/layout.tsx](/frontend/src/app/token/display/layout.tsx) | TypeScript JSX | -8 | -5 | -2 | -15 |
| [frontend/src/app/token/display/page.tsx](/frontend/src/app/token/display/page.tsx) | TypeScript JSX | -274 | -36 | -37 | -347 |
| [frontend/src/app/token/kiosk/\[code\]/page.tsx](/frontend/src/app/token/kiosk/%5Bcode%5D/page.tsx) | TypeScript JSX | -349 | -18 | -39 | -406 |
| [frontend/src/app/token/kiosk/layout.tsx](/frontend/src/app/token/kiosk/layout.tsx) | TypeScript JSX | -8 | 0 | -2 | -10 |
| [frontend/src/app/token/print-kiosk/layout.tsx](/frontend/src/app/token/print-kiosk/layout.tsx) | TypeScript JSX | -8 | 0 | -2 | -10 |
| [frontend/src/app/token/print-kiosk/page.tsx](/frontend/src/app/token/print-kiosk/page.tsx) | TypeScript JSX | -423 | -22 | -55 | -500 |
| [frontend/src/components/EmptyState.tsx](/frontend/src/components/EmptyState.tsx) | TypeScript JSX | -43 | 0 | -3 | -46 |
| [frontend/src/components/LicenseBanner.tsx](/frontend/src/components/LicenseBanner.tsx) | TypeScript JSX | -70 | -8 | -15 | -93 |
| [frontend/src/components/PageHeader.tsx](/frontend/src/components/PageHeader.tsx) | TypeScript JSX | -138 | -5 | -12 | -155 |
| [frontend/src/components/PatientSearch.tsx](/frontend/src/components/PatientSearch.tsx) | TypeScript JSX | -147 | -1 | -12 | -160 |
| [frontend/src/components/SectionCard.tsx](/frontend/src/components/SectionCard.tsx) | TypeScript JSX | -41 | -1 | -3 | -45 |
| [frontend/src/components/branch/BranchSelectModal.tsx](/frontend/src/components/branch/BranchSelectModal.tsx) | TypeScript JSX | -115 | -9 | -9 | -133 |
| [frontend/src/components/branch/BranchSwitcher.tsx](/frontend/src/components/branch/BranchSwitcher.tsx) | TypeScript JSX | -165 | -13 | -14 | -192 |
| [frontend/src/components/feedback/ImageCropDialog.tsx](/frontend/src/components/feedback/ImageCropDialog.tsx) | TypeScript JSX | -156 | -26 | -18 | -200 |
| [frontend/src/components/forms-designer/DesignerCanvas.tsx](/frontend/src/components/forms-designer/DesignerCanvas.tsx) | TypeScript JSX | -60 | -5 | -9 | -74 |
| [frontend/src/components/forms-designer/DesignerLeftPanel.tsx](/frontend/src/components/forms-designer/DesignerLeftPanel.tsx) | TypeScript JSX | -65 | -3 | -10 | -78 |
| [frontend/src/components/forms-designer/DesignerRightPanel.tsx](/frontend/src/components/forms-designer/DesignerRightPanel.tsx) | TypeScript JSX | -73 | -2 | -11 | -86 |
| [frontend/src/components/forms-designer/DesignerStatusBar.tsx](/frontend/src/components/forms-designer/DesignerStatusBar.tsx) | TypeScript JSX | -51 | -4 | -5 | -60 |
| [frontend/src/components/forms-designer/DesignerToolbar.tsx](/frontend/src/components/forms-designer/DesignerToolbar.tsx) | TypeScript JSX | -167 | -9 | -25 | -201 |
| [frontend/src/components/vendor/VendorRegisterDialog.tsx](/frontend/src/components/vendor/VendorRegisterDialog.tsx) | TypeScript JSX | -112 | 0 | -6 | -118 |
| [frontend/src/lib/api/attendance-monitoring.api.ts](/frontend/src/lib/api/attendance-monitoring.api.ts) | TypeScript | -21 | 0 | -3 | -24 |
| [frontend/src/lib/api/auth.api.ts](/frontend/src/lib/api/auth.api.ts) | TypeScript | -86 | -1 | -17 | -104 |
| [frontend/src/lib/api/branches.api.ts](/frontend/src/lib/api/branches.api.ts) | TypeScript | -23 | -4 | -6 | -33 |
| [frontend/src/lib/api/campaign.api.ts](/frontend/src/lib/api/campaign.api.ts) | TypeScript | -44 | -2 | -11 | -57 |
| [frontend/src/lib/api/client.ts](/frontend/src/lib/api/client.ts) | TypeScript | -85 | -9 | -16 | -110 |
| [frontend/src/lib/api/eic.api.ts](/frontend/src/lib/api/eic.api.ts) | TypeScript | -516 | -20 | -89 | -625 |
| [frontend/src/lib/api/his.api.ts](/frontend/src/lib/api/his.api.ts) | TypeScript | -138 | -2 | -20 | -160 |
| [frontend/src/lib/api/license.api.ts](/frontend/src/lib/api/license.api.ts) | TypeScript | -78 | -5 | -15 | -98 |
| [frontend/src/lib/api/loyalty.api.ts](/frontend/src/lib/api/loyalty.api.ts) | TypeScript | -140 | -1 | -25 | -166 |
| [frontend/src/lib/api/notification.api.ts](/frontend/src/lib/api/notification.api.ts) | TypeScript | -69 | -2 | -13 | -84 |
| [frontend/src/lib/api/reports.api.ts](/frontend/src/lib/api/reports.api.ts) | TypeScript | -66 | -1 | -9 | -76 |
| [frontend/src/lib/api/settings.api.ts](/frontend/src/lib/api/settings.api.ts) | TypeScript | -7 | 0 | -2 | -9 |
| [frontend/src/lib/api/users.api.ts](/frontend/src/lib/api/users.api.ts) | TypeScript | -92 | 0 | -21 | -113 |
| [frontend/src/lib/audio/tokenAudio.ts](/frontend/src/lib/audio/tokenAudio.ts) | TypeScript | -217 | -107 | -53 | -377 |
| [frontend/src/lib/generateId.ts](/frontend/src/lib/generateId.ts) | TypeScript | -17 | -15 | -1 | -33 |
| [frontend/src/lib/hooks/useDebounce.ts](/frontend/src/lib/hooks/useDebounce.ts) | TypeScript | -9 | 0 | -2 | -11 |
| [frontend/src/lib/hooks/useFullscreenToggle.ts](/frontend/src/lib/hooks/useFullscreenToggle.ts) | TypeScript | -24 | -6 | -4 | -34 |
| [frontend/src/lib/hooks/useTokenSocket.ts](/frontend/src/lib/hooks/useTokenSocket.ts) | TypeScript | -218 | -45 | -40 | -303 |
| [frontend/src/lib/store/auth.store.ts](/frontend/src/lib/store/auth.store.ts) | TypeScript | -67 | -10 | -9 | -86 |
| [frontend/src/providers/AuthProvider.tsx](/frontend/src/providers/AuthProvider.tsx) | TypeScript JSX | -136 | -30 | -23 | -189 |
| [frontend/src/providers/QueryProvider.tsx](/frontend/src/providers/QueryProvider.tsx) | TypeScript JSX | -30 | 0 | -4 | -34 |
| [frontend/src/providers/SessionTimeoutProvider.tsx](/frontend/src/providers/SessionTimeoutProvider.tsx) | TypeScript JSX | -155 | -12 | -29 | -196 |
| [frontend/src/providers/SnackbarProvider.tsx](/frontend/src/providers/SnackbarProvider.tsx) | TypeScript JSX | -13 | 0 | -3 | -16 |
| [frontend/src/providers/ThemeProvider.tsx](/frontend/src/providers/ThemeProvider.tsx) | TypeScript JSX | -355 | -28 | -32 | -415 |
| [frontend/tsconfig.json](/frontend/tsconfig.json) | JSON with Comments | -27 | 0 | -1 | -28 |

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details