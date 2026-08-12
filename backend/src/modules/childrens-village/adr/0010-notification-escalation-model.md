# 10. Notification Escalation Model

Date: 2026-08-02
Status: Accepted

## Context
The system needs to notify users about overdue IEPs, behavioural anomalies, and attendance drops. We need to decide whether to push these directly to the global HDSP platform notification service or manage them locally.

## Decision
We implemented a localized `cv_alerts` table. The `CvNotificationService` evaluates business rules and generates these internal alerts. 

They are presented first within the Children's Village administrative and teacher dashboards. They can optionally be escalated to the platform notification service (which handles SMS/Push/Email) based on severity or configuration.

## Consequences
- **Positive**: Prevents notification fatigue. A teacher can acknowledge and dismiss an "Attendance Drop" alert within the dashboard before it escalates to a Principal's phone or a Parent's app.
- **Positive**: Keeps domain-specific alert logic (e.g. "IEP Goal stalling") inside the CV module rather than bleeding into the global platform.
- **Negative**: Requires building a localized alert management UI in the frontend.
