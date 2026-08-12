# 6. DLR Orchestration Model

Date: 2026-08-02
Status: Accepted

## Context
Teachers log multiple data points daily: attendance, behaviour, IEP progress, and curriculum mastery. Expecting teachers to navigate to 4 different screens creates high friction and low compliance.

## Decision
We established the Daily Learning Record (DLR) as the single operational entry point for teachers. The `CvDailyLearningRecordService` acts as an orchestrator, catching the DLR payload and internally dispatching commands to `CvAttendanceService`, `CvDevelopmentService`, `CvCurriculumService`, and `CvIepService`.

## Consequences
- **Positive**: Extremely high UX quality for teachers. Fast, consolidated data entry.
- **Positive**: Guarantees data consistency (if a child was absent, no behaviour can be logged).
- **Negative**: The DLR Service is a highly coupled "God Service" orchestration layer, requiring careful dependency injection (e.g. `forwardRef`) to avoid circular imports.
