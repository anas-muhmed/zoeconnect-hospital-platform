/**
 * TypeORM CLI DataSource
 * Used by: npm run migration:generate / migration:run / migration:revert
 */
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { CreatePlatformSchema1700000001000 } from './migrations/1700000001000-CreatePlatformSchema';
import { CreateLicensingSchema1700000002000 } from './migrations/1700000002000-CreateLicensingSchema';
import { CreateAuditSchema1700000003000 } from './migrations/1700000003000-CreateAuditSchema';
import { CreateNotificationSchema1700000004000 } from './migrations/1700000004000-CreateNotificationSchema';
import { CreateLoyaltySchema1700000005000 } from './migrations/1700000005000-CreateLoyaltySchema';
import { CreateNotificationV2Schema1700000006000 } from './migrations/1700000006000-CreateNotificationV2Schema';
import { AddPhoneToLoyaltyAccounts1700000007000 } from './migrations/1700000007000-AddPhoneToLoyaltyAccounts';
import { CreateVendorSyncSchema1700000008000 } from './migrations/1700000008000-CreateVendorSyncSchema';
import { MakeSystemColumnsNullable1700000009000 } from './migrations/1700000009000-MakeSystemColumnsNullable';
import { CreateHisSchemaConfig1700000010000 } from './migrations/1700000010000-CreateHisSchemaConfig';
import { CreateEICSchema1700000011000 } from './migrations/1700000011000-CreateEICSchema';
import { EicTherapistIdToVarchar1700000012000 } from './migrations/1700000012000-EicTherapistIdToVarchar';
import { PreschoolEnhancements1700000013000 } from './migrations/1700000013000-PreschoolEnhancements';
import { CreateTokenSchema1700000014000 } from './migrations/1700000014000-CreateTokenSchema';
import { GoalExtensionPlaceholder1700000014001 } from './migrations/1700000014000-GoalExtension';
import { AddTokenLocations1700000015000 } from './migrations/1700000015000-AddTokenLocations';
import { UserRolesManyToMany1700000016000 } from './migrations/1700000016000-UserRolesManyToMany';
import { CreateUserPermissions1700000017000 } from './migrations/1700000017000-CreateUserPermissions';
import { CreateTokenDisplayConfig1700000018000 } from './migrations/1700000018000-CreateTokenDisplayConfig';
import { CreateDisplayPages1700000019000 } from './migrations/1700000019000-CreateDisplayPages';
import { CreateAttendanceRealtimeSchema1700000020000 } from './migrations/1700000020000-CreateAttendanceRealtimeSchema';
import { CreateUserBranches1700000021000 } from './migrations/1700000021000-CreateUserBranches';
import { BranchIdDefaultToAlmas1700000022000 } from './migrations/1700000022000-BranchIdDefaultToAlmas';
import { AddHisEmployeeMapping1751140000000 } from './migrations/1751140000000-AddHisEmployeeMapping';
import { AddHisColumnsToTokenLocations1751200000000 } from './migrations/1751200000000-AddHisColumnsToTokenLocations';
import { TokenArchitecturePhase11751300000000 } from './migrations/1751300000000-TokenArchitecturePhase1';
import { AddTokenPrefixToLocations1751400000001 } from './migrations/1751400000001-AddTokenPrefixToLocations';
import { AddResetToAuditLogAction1751400000002 } from './migrations/1751400000002-AddResetToAuditLogAction';
import { ExpandTokenCallsSchema1751400000003 } from './migrations/1751400000003-ExpandTokenCallsSchema';
import { GoalExtension1751400000004 } from './migrations/1751400000004-GoalExtension';
import { AddDisciplineAssignments1751400000005 } from './migrations/1751400000005-AddDisciplineAssignments';
import { CreateAttendanceDependencyEvents1751500000001 } from './migrations/1751500000001-CreateAttendanceDependencyEvents';
import { AddScopeToAttendanceDependencyEvents1751600000001 } from './migrations/1751600000001-AddScopeToAttendanceDependencyEvents';
import { CreateAttendanceDependencySnapshot1751600000002 } from './migrations/1751600000002-CreateAttendanceDependencySnapshot';
import { CreateAttendanceDivergenceLog1751600000003 } from './migrations/1751600000003-CreateAttendanceDivergenceLog';
import { CreateAttendanceGovernanceLocks1751700000001 } from './migrations/1751700000001-CreateAttendanceGovernanceLocks';
import { CreateAttendanceSkipLog1751700000002 } from './migrations/1751700000002-CreateAttendanceSkipLog';
import { AddRegistrationColumnsToTokenRecords1751800000001 } from './migrations/1751800000001-AddRegistrationColumnsToTokenRecords';
import { CreateRegistrationMappingSchema1751800000002 } from './migrations/1751800000002-CreateRegistrationMappingSchema';
import { CreateDocumentPlatformSchema1783251715976 } from './migrations/1783251715976-CreateDocumentPlatformSchema';
import { AddAssetEntity1783276251575 } from './migrations/1783276251575-AddAssetEntity';
import { CreateImportJobsTable1783300000000 } from './migrations/1783300000000-CreateImportJobsTable';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { ConsolidateRecentChanges1783326737784 } from './migrations/1783326737784-ConsolidateRecentChanges';
import { CreatePasswordResetRequestsTable1783400000000 } from './migrations/1783400000000-CreatePasswordResetRequestsTable';
import { AddRecoveryAccountFields1783341110006 } from './migrations/1783341110006-AddRecoveryAccountFields';
import { CreateSystemSettings1783405488684 } from './migrations/1783405488684-CreateSystemSettings';
import { AddTokenConfigReadPermission1783420000000 } from './migrations/1783420000000-AddTokenConfigReadPermission';
import { CreateWorkstationConfiguration1783430000000 } from './migrations/1783430000000-CreateWorkstationConfiguration';
import { EnsureTokenRecordsRegisteredAt1783440000000 } from './migrations/1783440000000-EnsureTokenRecordsRegisteredAt';
import { EnsureTokenRecordsRegistrationColumns1783450000000 } from './migrations/1783450000000-EnsureTokenRecordsRegistrationColumns';
import { EnsureTokenSequencesConstraints1783460000000 } from './migrations/1783460000000-EnsureTokenSequencesConstraints';
import { AddTokenRecordsReferenceIndexes1783470000000 } from './migrations/1783470000000-AddTokenRecordsReferenceIndexes';
import { AddRegistrationViewActionPermissions1783480000000 } from './migrations/1783480000000-AddRegistrationViewActionPermissions';
import { CreateCmsModule1783490000000 } from './migrations/1783490000000-CreateCmsModule';
import { CreateCmsScheduling1783500000000 } from './migrations/1783500000000-CreateCmsScheduling';
import { CmsHardening1783510000000 } from './migrations/1783510000000-CmsHardening';
import { CmsPlayerHealth1783520000000 } from './migrations/1783520000000-CmsPlayerHealth';
import { CmsV1Stabilization1783530000000 } from './migrations/1783530000000-CmsV1Stabilization';
import { CmsPluginConfig1783540000000 } from './migrations/1783540000000-CmsPluginConfig';
import { CreateCmsTicker1783550000000 } from './migrations/1783550000000-CreateCmsTicker';
import { CreateFeedbackModule1783560000000 } from './migrations/1783560000000-CreateFeedbackModule';
import { CreateFeedbackPhase21783570000000 } from './migrations/1783570000000-CreateFeedbackPhase2';
import { AddFeedbackFormHeaderImage1783580000000 } from './migrations/1783580000000-AddFeedbackFormHeaderImage';
import { AddFeedbackAnswerDisplayValue1783590000000 } from './migrations/1783590000000-AddFeedbackAnswerDisplayValue';
import { AddFeedbackSubmissionCampaignDedupIndex1783600000000 } from './migrations/1783600000000-AddFeedbackSubmissionCampaignDedupIndex';
import { AddFeedbackFormSplashScreen1783610000000 } from './migrations/1783610000000-AddFeedbackFormSplashScreen';
import { AddFeedbackCampaignGoogleReview1783620000000 } from './migrations/1783620000000-AddFeedbackCampaignGoogleReview';
import { CreateFeedbackComplaints1783630000000 } from './migrations/1783630000000-CreateFeedbackComplaints';
import { AddFeedbackAnalyticsPermission1783640000000 } from './migrations/1783640000000-AddFeedbackAnalyticsPermission';
import { AddFeedbackReportPermission1783650000000 } from './migrations/1783650000000-AddFeedbackReportPermission';
import { CreateFeedbackLanguages1783660000000 } from './migrations/1783660000000-CreateFeedbackLanguages';
import { CreateFeedbackNotifications1783670000000 } from './migrations/1783670000000-CreateFeedbackNotifications';
import { MakeFeedbackAnswerValueNullable1783680000000 } from './migrations/1783680000000-MakeFeedbackAnswerValueNullable';
import { CreateFeedbackSettings1783690000000 } from './migrations/1783690000000-CreateFeedbackSettings';
import { CreateTenantTable1783700000000 } from './migrations/1783700000000-CreateTenantTable';
import { SeedDefaultTenant1783710000000 } from './migrations/1783710000000-SeedDefaultTenant';
import { AddTenantIdToSettingsTables1783720000000 } from './migrations/1783720000000-AddTenantIdToSettingsTables';
import { AddTenantIdToLicensingTables1783730000000 } from './migrations/1783730000000-AddTenantIdToLicensingTables';
import { AddTenantIdToAuthRbacTables1783740000000 } from './migrations/1783740000000-AddTenantIdToAuthRbacTables';
import { AddTenantIdToAuditNotificationTables1783750000000 } from './migrations/1783750000000-AddTenantIdToAuditNotificationTables';
import { AddTenantIdToLoyaltyTables1783760000000 } from './migrations/1783760000000-AddTenantIdToLoyaltyTables';
import { AddTenantIdToEicTables1783770000000 } from './migrations/1783770000000-AddTenantIdToEicTables';
import { AddTenantIdToAttendanceTables1783780000000 } from './migrations/1783780000000-AddTenantIdToAttendanceTables';
import { AddTenantIdToAttendanceDependencyEvents1783780000001 } from './migrations/1783780000001-AddTenantIdToAttendanceDependencyEvents';
import { AddTenantIdToCmsTables1783790000000 } from './migrations/1783790000000-AddTenantIdToCmsTables';
import { AddTenantIdToFeedbackTables1783800000000 } from './migrations/1783800000000-AddTenantIdToFeedbackTables';
import { AddTenantIdToTokenTables1783810000000 } from './migrations/1783810000000-AddTenantIdToTokenTables';
import { BackfillDefaultRolePermissions1783820000000 } from './migrations/1783820000000-BackfillDefaultRolePermissions';
import { CreateSubscriptionLicenses1783830000000 } from './migrations/1783830000000-CreateSubscriptionLicenses';
import { CreateTenantProvisioning1783840000000 } from './migrations/1783840000000-CreateTenantProvisioning';
import { CreateFeatureFlags1783850000000 } from './migrations/1783850000000-CreateFeatureFlags';
import { BackfillTenantIdDataHygiene1783860000000 } from './migrations/1783860000000-BackfillTenantIdDataHygiene';
import { AddHisEmployeeCodeTenantScopedIndex1783870000000 } from './migrations/1783870000000-AddHisEmployeeCodeTenantScopedIndex';
import { TenantScopedIdentityCompositeConstraints1783880000000 } from './migrations/1783880000000-TenantScopedIdentityCompositeConstraints';
import { Task10TenantScopedUniqueConstraints1783890000000 } from './migrations/1783890000000-Task10TenantScopedUniqueConstraints';
import { RegisterCmsModule1785000000000 } from './migrations/1785000000000-RegisterCmsModule';
import { TenantSubdomainReleaseLifecycle1785100000000 } from './migrations/1785100000000-TenantSubdomainReleaseLifecycle';
import { VendorRegistrationSingletonEnforcement1785200000000 } from './migrations/1785200000000-VendorRegistrationSingletonEnforcement';
import { BackfillLicensingTenantId1785300000000 } from './migrations/1785300000000-BackfillLicensingTenantId';
import { PerTenantLicensingConstraints1785400000000 } from './migrations/1785400000000-PerTenantLicensingConstraints';
import { PerTenantTokenConfigConstraints1785500000000 } from './migrations/1785500000000-PerTenantTokenConfigConstraints';
import { PerTenantSystemSettings1785600000000 } from './migrations/1785600000000-PerTenantSystemSettings';
import { PerTenantTokenLocations1785800000000 } from './migrations/1785800000000-PerTenantTokenLocations';
import { CreateConnectorInstances1785900000000 } from './migrations/1785900000000-CreateConnectorInstances';
import { CreateHisQueryDefinitions1786000000000 } from './migrations/1786000000000-CreateHisQueryDefinitions';
import { AddExpiresAtToConnectorPairings1786100000000 } from './migrations/1786100000000-AddExpiresAtToConnectorPairings';
import { CreateKioskDevices1786300000000 } from './migrations/1786300000000-CreateKioskDevices';
import { CreateIncidentManagementSchema1787000000000 } from './migrations/1787000000000-CreateIncidentManagementSchema';
import { CreateBackupModule1788000000000 } from './migrations/1788000000000-CreateBackupModule';
import { CreateIncidentNotificationRoles1787200000000 } from './migrations/1787200000000-CreateIncidentNotificationRoles';
import { RegisterIncidentModule1787300000000 } from './migrations/1787300000000-RegisterIncidentModule';
import { BackupStorageMultiDestinationAndEncryption1788100000000 } from './migrations/1788100000000-BackupStorageMultiDestinationAndEncryption';
import { CreateBackupToolSettings1788200000000 } from './migrations/1788200000000-CreateBackupToolSettings';
import { AddPgEngineExecutionModeAndDocker1788300000000 } from './migrations/1788300000000-AddPgEngineExecutionModeAndDocker';
import { CreateOrganizationBranches1788400000000 } from './migrations/1788400000000-CreateOrganizationBranches';
import { AddOrganizationBranchPermissions1788400000001 } from './migrations/1788400000001-AddOrganizationBranchPermissions';
import { GlobalIdentityUniqueness1788500000000 } from './migrations/1788500000000-GlobalIdentityUniqueness';
import { MakeProvisioningSubdomainOptional1788600000000 } from './migrations/1788600000000-MakeProvisioningSubdomainOptional';
import { AddCancelledLicenseRequestStatus1788700000000 } from './migrations/1788700000000-AddCancelledLicenseRequestStatus';
import { AddIncidentManagerRole1788800000000 } from './migrations/1788800000000-AddIncidentManagerRole';
import { DeduplicateRoles1788900000000 } from './migrations/1788900000000-DeduplicateRoles';
import { NarrowActiveResetIndexToRequestedOnly1789000000000 } from './migrations/1789000000000-NarrowActiveResetIndexToRequestedOnly';
import { AddDisplayTokenToTokenLocations1789100000000 } from './migrations/1789100000000-AddDisplayTokenToTokenLocations';
import { CreateChildrensVillagePhase1_1789200000000 } from './migrations/1789200000000-CreateChildrensVillagePhase1';
import { CreateCVStudentsPhase2_1789300000000 } from './migrations/1789300000000-CreateCVStudentsPhase2';
import { CreateCVStudentsPhase31789400000000 } from './migrations/1789400000000-CreateCVStudentsPhase3';
import { CreateCVPhase4_1789500000000 } from './migrations/1789500000000-CreateCVPhase4';
import { CreateCVPhase5_1789600000000 } from './migrations/1789600000000-CreateCVPhase5';
import { CreateCVPhase6_1789700000000 } from './migrations/1789700000000-CreateCVPhase6';
import { CreateCVPhase7_1789800000000 } from './migrations/1789800000000-CreateCVPhase7';
import { CreateCVPhase8_1789900000000 } from './migrations/1789900000000-CreateCVPhase8';
import { RegisterChildrensVillageModule1790000000000 } from './migrations/1790000000000-RegisterChildrensVillageModule';
import { CreateCvTimetablePeriodOverrides_1790100000000 } from './migrations/1790100000000-CreateCvTimetablePeriodOverrides';
import { CreateCvSettingsAndAdmissionApproval1790200000000 } from './migrations/1790200000000-CreateCvSettingsAndAdmissionApproval';
import { CreateCvTimetableFoundation1790300000000 } from './migrations/1790300000000-CreateCvTimetableFoundation';
import { CreateCvTimetableWorkflow1790400000000 } from './migrations/1790400000000-CreateCvTimetableWorkflow';
import { CreateCvTimetableChangeRequests1790500000000 } from './migrations/1790500000000-CreateCvTimetableChangeRequests';
import { ExtendCvClassroomsForTimetabling1790600000000 } from './migrations/1790600000000-ExtendCvClassroomsForTimetabling';
import { SeedGlobalRolesAndPermissions1790700000000 } from './migrations/1790700000000-SeedGlobalRolesAndPermissions';
import { RepairMisstampedFeedbackTenantId1790800000000 } from './migrations/1790800000000-RepairMisstampedFeedbackTenantId';
import { TenantScopeCmsDisplayAssignmentSlug1790900000000 } from './migrations/1790900000000-TenantScopeCmsDisplayAssignmentSlug';
import { TenantScopeTokenDisplaySlug1790900000001 } from './migrations/1790900000001-TenantScopeTokenDisplaySlug';
import { AddBillingPricingToModuleRegistry1791000000000 } from './migrations/1791000000000-AddBillingPricingToModuleRegistry';
import { SeedModuleCatalogPricing1791000000001 } from './migrations/1791000000001-SeedModuleCatalogPricing';
import { CreateBillingSchema1791000000002 } from './migrations/1791000000002-CreateBillingSchema';
import { AddProviderColumnsToSubscriptionLicenses1791000000003 } from './migrations/1791000000003-AddProviderColumnsToSubscriptionLicenses';
import { AdjustBillingQuoteStatusLifecycle1791100000000 } from './migrations/1791100000000-AdjustBillingQuoteStatusLifecycle';
import { AddQuoteSnapshotAndPaymentIntents1791200000000 } from './migrations/1791200000000-AddQuoteSnapshotAndPaymentIntents';
import { FixModuleRegistryVisibility1791300000000 } from './migrations/1791300000000-FixModuleRegistryVisibility';
import { CreateBillingSubscriptionChanges1791400000000 } from './migrations/1791400000000-CreateBillingSubscriptionChanges';
import { AddQuoteTypeToBillingQuotes1791500000000 } from './migrations/1791500000000-AddQuoteTypeToBillingQuotes';
import { AddPeriodEndToBillingSubscriptionItems1791600000000 } from './migrations/1791600000000-AddPeriodEndToBillingSubscriptionItems';
import { DeactivateTokenQueueModule1791700000000 } from './migrations/1791700000000-DeactivateTokenQueueModule';
import { EnsureCoreModuleRegistryRows1791800000000 } from './migrations/1791800000000-EnsureCoreModuleRegistryRows';

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
  migrations: [
    CreatePlatformSchema1700000001000,
    CreateLicensingSchema1700000002000,
    CreateAuditSchema1700000003000,
    CreateNotificationSchema1700000004000,
    CreateLoyaltySchema1700000005000,
    CreateNotificationV2Schema1700000006000,
    AddPhoneToLoyaltyAccounts1700000007000,
    CreateVendorSyncSchema1700000008000,
    MakeSystemColumnsNullable1700000009000,
    CreateHisSchemaConfig1700000010000,
    CreateEICSchema1700000011000,
    EicTherapistIdToVarchar1700000012000,
    PreschoolEnhancements1700000013000,
    CreateTokenSchema1700000014000,
    GoalExtensionPlaceholder1700000014001,
    AddTokenLocations1700000015000,
    UserRolesManyToMany1700000016000,
    CreateUserPermissions1700000017000,
    CreateTokenDisplayConfig1700000018000,
    CreateDisplayPages1700000019000,
    CreateAttendanceRealtimeSchema1700000020000,
    CreateUserBranches1700000021000,
    BranchIdDefaultToAlmas1700000022000,
    AddHisEmployeeMapping1751140000000,
    AddHisColumnsToTokenLocations1751200000000,
    TokenArchitecturePhase11751300000000,
    AddTokenPrefixToLocations1751400000001,
    AddResetToAuditLogAction1751400000002,
    ExpandTokenCallsSchema1751400000003,
    GoalExtension1751400000004,
    AddDisciplineAssignments1751400000005,
    CreateAttendanceDependencyEvents1751500000001,
    AddScopeToAttendanceDependencyEvents1751600000001,
    CreateAttendanceDependencySnapshot1751600000002,
    CreateAttendanceDivergenceLog1751600000003,
    CreateAttendanceGovernanceLocks1751700000001,
    CreateAttendanceSkipLog1751700000002,
    AddRegistrationColumnsToTokenRecords1751800000001,
    CreateRegistrationMappingSchema1751800000002,

    CreateDocumentPlatformSchema1783251715976,
    AddAssetEntity1783276251575,
    CreateImportJobsTable1783300000000,
    ConsolidateRecentChanges1783326737784,
    AddRecoveryAccountFields1783341110006,
    CreatePasswordResetRequestsTable1783400000000,
    CreateSystemSettings1783405488684,
    AddTokenConfigReadPermission1783420000000,
    CreateWorkstationConfiguration1783430000000,
    EnsureTokenRecordsRegisteredAt1783440000000,
    EnsureTokenRecordsRegistrationColumns1783450000000,
    EnsureTokenSequencesConstraints1783460000000,
    AddTokenRecordsReferenceIndexes1783470000000,
    AddRegistrationViewActionPermissions1783480000000,
    CreateCmsModule1783490000000,
    CreateCmsScheduling1783500000000,
    CmsHardening1783510000000,
    CmsPlayerHealth1783520000000,
    CmsV1Stabilization1783530000000,
    CmsPluginConfig1783540000000,
    CreateCmsTicker1783550000000,
    CreateFeedbackModule1783560000000,
    CreateFeedbackPhase21783570000000,
    AddFeedbackFormHeaderImage1783580000000,
    AddFeedbackAnswerDisplayValue1783590000000,
    AddFeedbackSubmissionCampaignDedupIndex1783600000000,
    AddFeedbackFormSplashScreen1783610000000,
    AddFeedbackCampaignGoogleReview1783620000000,
    CreateFeedbackComplaints1783630000000,
    AddFeedbackAnalyticsPermission1783640000000,
    AddFeedbackReportPermission1783650000000,
    CreateFeedbackLanguages1783660000000,
    CreateFeedbackNotifications1783670000000,
    MakeFeedbackAnswerValueNullable1783680000000,
    CreateFeedbackSettings1783690000000,
    CreateTenantTable1783700000000,
    SeedDefaultTenant1783710000000,
    AddTenantIdToSettingsTables1783720000000,
    AddTenantIdToLicensingTables1783730000000,
    AddTenantIdToAuthRbacTables1783740000000,
    AddTenantIdToAuditNotificationTables1783750000000,
    AddTenantIdToLoyaltyTables1783760000000,
    AddTenantIdToEicTables1783770000000,
    AddTenantIdToAttendanceTables1783780000000,
    AddTenantIdToAttendanceDependencyEvents1783780000001,
    AddTenantIdToCmsTables1783790000000,
    AddTenantIdToFeedbackTables1783800000000,
    AddTenantIdToTokenTables1783810000000,
    BackfillDefaultRolePermissions1783820000000,
    CreateSubscriptionLicenses1783830000000,
    CreateTenantProvisioning1783840000000,
    CreateFeatureFlags1783850000000,
    BackfillTenantIdDataHygiene1783860000000,
    AddHisEmployeeCodeTenantScopedIndex1783870000000,
    TenantScopedIdentityCompositeConstraints1783880000000,
    Task10TenantScopedUniqueConstraints1783890000000,
    RegisterCmsModule1785000000000,
    TenantSubdomainReleaseLifecycle1785100000000,
    // Self-review fix (finding 3): these three were previously missing
    // from this array, so `npm run migration:run` (the actual CLI
    // mechanism used by infrastructure/installer/install.sh and
    // infrastructure/pm2/ecosystem.config.js) never applied them. They
    // must run in this exact order: singleton enforcement, then the
    // tenant_id backfill, then the per-tenant constraint swap (which
    // depends on the backfill having run first).
    VendorRegistrationSingletonEnforcement1785200000000,
    BackfillLicensingTenantId1785300000000,
    PerTenantLicensingConstraints1785400000000,
    PerTenantTokenConfigConstraints1785500000000,
    PerTenantSystemSettings1785600000000,
    PerTenantTokenLocations1785800000000,
    CreateConnectorInstances1785900000000,
    CreateHisQueryDefinitions1786000000000,
    AddExpiresAtToConnectorPairings1786100000000,
    CreateKioskDevices1786300000000,
    CreateIncidentManagementSchema1787000000000,
    CreateIncidentNotificationRoles1787200000000,
    RegisterIncidentModule1787300000000,
    CreateBackupModule1788000000000,
    BackupStorageMultiDestinationAndEncryption1788100000000,
    CreateBackupToolSettings1788200000000,
    AddPgEngineExecutionModeAndDocker1788300000000,
    CreateOrganizationBranches1788400000000,
    AddOrganizationBranchPermissions1788400000001,
    GlobalIdentityUniqueness1788500000000,
    MakeProvisioningSubdomainOptional1788600000000,
    AddCancelledLicenseRequestStatus1788700000000,
    AddIncidentManagerRole1788800000000,
    DeduplicateRoles1788900000000,
    NarrowActiveResetIndexToRequestedOnly1789000000000,
    AddDisplayTokenToTokenLocations1789100000000,
    CreateChildrensVillagePhase1_1789200000000,
    CreateCVStudentsPhase2_1789300000000,
    CreateCVStudentsPhase31789400000000,
    CreateCVPhase4_1789500000000,
    CreateCVPhase5_1789600000000,
    CreateCVPhase6_1789700000000,
    CreateCVPhase7_1789800000000,
    CreateCVPhase8_1789900000000,
    RegisterChildrensVillageModule1790000000000,
    CreateCvTimetablePeriodOverrides_1790100000000,
    CreateCvSettingsAndAdmissionApproval1790200000000,
    CreateCvTimetableFoundation1790300000000,
    CreateCvTimetableWorkflow1790400000000,
    CreateCvTimetableChangeRequests1790500000000,
    ExtendCvClassroomsForTimetabling1790600000000,
    SeedGlobalRolesAndPermissions1790700000000,
    RepairMisstampedFeedbackTenantId1790800000000,
    TenantScopeCmsDisplayAssignmentSlug1790900000000,
    TenantScopeTokenDisplaySlug1790900000001,
    AddBillingPricingToModuleRegistry1791000000000,
    SeedModuleCatalogPricing1791000000001,
    CreateBillingSchema1791000000002,
    AddProviderColumnsToSubscriptionLicenses1791000000003,
    AdjustBillingQuoteStatusLifecycle1791100000000,
    AddQuoteSnapshotAndPaymentIntents1791200000000,
    FixModuleRegistryVisibility1791300000000,
    CreateBillingSubscriptionChanges1791400000000,
    AddQuoteTypeToBillingQuotes1791500000000,
    AddPeriodEndToBillingSubscriptionItems1791600000000,
    DeactivateTokenQueueModule1791700000000,
    EnsureCoreModuleRegistryRows1791800000000,
  ],
  migrationsTableName: 'typeorm_migrations',
});
