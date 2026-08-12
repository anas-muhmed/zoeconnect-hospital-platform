# 7. Native CV Attendance vs HDSP Platform Attendance

Date: 2026-08-02
Status: Accepted

## Context
The HDSP platform has an existing Attendance module. Should Children's Village students use it?

## Decision
We rejected using the global HDSP attendance module for CV students. We built a native `cv_student_attendance` entity within the Children's Village module.

## Consequences
- **Positive**: Educational context. CV attendance requires statuses like `FIELD_TRIP`, `THERAPY_SESSION`, and `HALF_DAY`, whereas the platform attendance is designed for HR employee punch-ins.
- **Positive**: Clean separation of student vs. staff logic.
- **Negative**: Redundant schema patterns across the platform, but acceptable for domain-driven boundaries.
