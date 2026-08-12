# 8. Student Schedule Override Architecture

Date: 2026-08-02
Status: Accepted

## Context
Special education students often have unique schedules (e.g., pulled out of Math class on Tuesdays for Speech Therapy) that conflict with their assigned Class timetable.

## Decision
Instead of creating a completely bespoke timetable for every single student, we implemented an Override architecture. Students inherit their base schedule from their `CvClass` -> `CvTimetable`. The `cv_student_schedule_overrides` table explicitly overrides specific periods (e.g., overriding Period 3 on Tuesday to point to `THERAPY`).

## Consequences
- **Positive**: Vastly reduces data duplication. 90% of the schedule is inherited; only the exceptions are stored.
- **Positive**: Easy to revert a student to the baseline class schedule.
- **Negative**: Timetable resolution queries are slightly more complex (Merge logic required).
