# 2. Vendor Portal Adapter Selection

Date: 2026-08-02
Status: Accepted

## Context
Since the `CVStudentProvider` is an interface with multiple implementations, the application needs to know which adapter to inject at runtime. Initially, there was a temptation to store this in an application-level setting (`cv.student.provider`) via `SettingsService`.

## Decision
We rejected application-level settings for adapter resolution. Instead, the active adapter is resolved via the `FeatureFlagsService`, which is populated by the **Vendor Portal provisioning/configuration process**. 

## Consequences
- **Positive**: Centralized control. A tenant cannot accidentally misconfigure their system and switch their data source.
- **Positive**: Aligns with the global architecture where infrastructure and core module behavior are dictated by licensing and provisioning, not user-editable settings.
- **Negative**: Testing requires mocking the feature flag / provisioning state.
