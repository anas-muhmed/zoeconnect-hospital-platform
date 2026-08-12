# 4. Grade-Based Curriculum Mapping

Date: 2026-08-02
Status: Accepted

## Context
Curriculum frameworks (Units, Topics, Objectives) need to be mapped to the students. Initially, mapping curriculum directly to a `CvClass` was considered.

## Decision
Curriculum mapping is strictly tied to a `CvGrade` (Level) rather than a specific `CvClass`. A `CvClass` is then assigned to a `CvGrade`. 

## Consequences
- **Positive**: Multiple classes (e.g., Pre-K A, Pre-K B) inherently share the same curriculum without duplication.
- **Positive**: Scales elegantly for larger schools.
- **Negative**: Slight indirection when a teacher views their class curriculum, as the system must resolve Class -> Grade -> Curriculum.
