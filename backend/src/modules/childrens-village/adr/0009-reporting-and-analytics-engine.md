# 9. Reporting and Analytics Engine Architecture

Date: 2026-08-02
Status: Accepted

## Context
Phase 6 introduces a need for comprehensive reporting and analytics. We must balance real-time data access for operational reports with performant aggregated queries for long-term analytics and future AI models.

## Decision
We split the architecture into two distinct patterns:
1. **Reporting Engine (`CvReportingService`)**: Operates on live transactional data. It is a dynamic query builder that produces lists (e.g. Class Register, Attendance Register) and supports exporting to PDF/Excel/CSV via a reusable `CvExportService`.
2. **Analytics Snapshots (`CvAnalyticsService`)**: Uses a scheduled or event-driven ETL approach to flatten daily/weekly metrics (Attendance %, Goal Achievement, Behaviour Trend) into the `cv_analytics_snapshots` table. A chronological `cv_event_timeline` is also maintained.

## Consequences
- **Positive**: Read queries for complex dashboards are highly performant because they query pre-aggregated snapshots.
- **Positive**: The chronological event timeline and flat snapshots are perfectly structured for future AI consumption (RAG, summarization, predictive models) without requiring expensive JOINs.
- **Negative**: Snapshot data may be slightly stale (e.g. end-of-day resolution) compared to live reporting.
