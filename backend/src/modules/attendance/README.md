# Punch Upload Integration

## Architecture Decision

ZoeConnect uses Oracle polling as the production default for realtime `ATTLOGS` detection.

| Option | Fit | Decision |
| --- | --- | --- |
| Oracle Continuous Query Notification | Low-latency but needs Oracle privileges, stable registrations, and driver support in the deployment mode. | Keep as future listener implementation. |
| Oracle CDC | Strong change stream, but usually requires supplemental logging and DBA ownership. | Not first release. |
| Polling | Simple, observable, works with existing Oracle read access, Redis, Bull, and current HIS sync style. | Selected. |
| Oracle AQ | Excellent if HIS publishes messages, but source HIS cannot be modified. | Not viable unless DB team adds triggers/queues. |
| Debezium | Good platform CDC, but heavy for one table and needs Kafka/connect infrastructure. | Future scale option. |
| GoldenGate | Enterprise-grade, expensive and operationally heavy. | Future enterprise replication option. |

The listener boundary is `OraclePollingService` -> `AttendanceListener`. A future CQN/AQ/CDC service can emit the same normalized `AttlogPunch` payloads without changing `AttendanceProcessor`.

## Phases

1. Architecture: new `AttendanceModule` under backend feature modules, reusing `HisModule`, `OraclePoolService`, Redis, Bull, TypeORM migrations, schedule jobs, RBAC.
2. Database design: PostgreSQL tables `attendance_events`, `attendance_audit`, `attendance_rules`, `attendance_reconciliation`; Oracle `ATTLOGS`, `EMPLOYEE`, `DUTYPLANVALUES`, `SHIFT_TYPE`, `LEAVEMASTER`, and `DUTYACTUALVALUES` remain HIS-owned.
3. Realtime processing: cursor-based polling, dedupe, queue, retry, day recomputation, Oracle `MERGE`.
4. Rule engine: `attendance_rules.rules` JSON controls grace windows, duplicate windows, thresholds, night shift behavior, future/backdated safety.
5. API design: `/attendance/realtime/cursor`, `/cursor/reset`, `/poll-now`, `/reconcile`.
6. Backend implementation: services are separated into listener, processor, roster resolver, rule engine, decision engine, updater, audit, reconciliation.
7. Cron reconciliation: nightly `ATTENDANCE_RECON_CRON`, default `1:30 AM`, reprocesses the last 30 hours of stored events.
8. Testing strategy: unit test decision engine scenarios; integration test Oracle SQL against a staging HIS schema; load test polling and queue latency.
9. Deployment: run migration, verify HIS schema config keys, ensure ATTLOGS date column index, set polling interval and batch size.
10. Future enhancements: CQN/AQ listener, UI monitoring, alerting, manual correction workflow, rule authoring screen, Prometheus metrics.

## HIS Table Mapping

- `ATTLOGS.EMPLOYEECODE` maps to `EMPLOYEE.EMPNO`.
- `EMPLOYEE.EMPLOYEE_ID` maps to `DUTYPLANVALUES.EMPID` and `DUTYACTUALVALUES.EMPID`.
- Planned duty comes from `DUTYPLANVALUES.PLANDATE`, `SHIFTPLAN`, and `SECONDSHIFT`.
- Shift timing and status semantics come from `SHIFT_TYPE.START_TIMING`, `END_TIMING`, `ISLEAVE`, `NATIONAL_HOLIDAY`, `ISWEEKOFF`, `MISSPUNCH`, and `NOPUNCHNOLEAVE`.
- Leave display data comes from `LEAVEMASTER` via `SHIFT_TYPE.LEAVEMASTER`.
- Realtime actual attendance writes to `DUTYACTUALVALUES.SHIFTACTUAL`, `FROMDATETIME`, `TODATETIME`, `FROMTIME`, `TOTIME`, `DURATION`, `DURATIONINMINUTES`, `ATTENDANCE`, and `REMARKS`.

## Required Oracle Indexes

For sub-2s latency, the HIS DBA should ensure:

```sql
CREATE INDEX IDX_ATTLOGS_LOGDT_EMP ON ATTLOGS (LOGDATETIME, EMPLOYEECODE);
CREATE INDEX IDX_EMPLOYEE_EMPNO ON EMPLOYEE (EMPNO);
CREATE INDEX IDX_DUTYPLANVALUES_EMP_DATE ON DUTYPLANVALUES (EMPID, PLANDATE);
CREATE INDEX IDX_DUTYACTUALVALUES_EMP_DATE ON DUTYACTUALVALUES (EMPID, ACTUALDATE);
```

Actual table/column names can be overridden through `his_schema_configs` using the `attendance.*` keys in `AttendanceConfigService`.

## Event Flow

`ATTLOGS` -> `OraclePollingService` -> `attendance_events` -> Bull queue `attendance-realtime` -> `AttendanceProcessor` -> `RosterResolver` (`EMPLOYEE` + `DUTYPLANVALUES` + `SHIFT_TYPE`) -> `ShiftRuleEngine` -> `AttendanceDecisionEngine` -> `DutyActualUpdater` (`DUTYACTUALVALUES`) -> `attendance_audit`.

Idempotency is source-punch based for event discovery and employee/day based for processing. Each new punch recomputes the whole duty window so out-of-order and multiple punches converge to one actual attendance result.

## Scenario Matrix

| Scenario | Expected behavior | DB update | Recovery |
| --- | --- | --- | --- |
| Normal In-Out | Mark Present. | `DUTYACTUALVALUE` status Present with in/out. | Night reconciliation confirms. |
| Single punch | Mark Miss Punch/Missing Out unless configured otherwise. | Store available punch. | Later punch recomputes same day. |
| Missing In/Out | Mark Miss Punch with manual review. | Store known punch. | Manual correction or later punch. |
| Multiple punches | Earliest and latest valid punches used. | Present/Half Day/Miss Punch by thresholds. | Recompute is idempotent. |
| Duplicate punches | Ignore within duplicate window. | No duplicate effect. | Rule-configurable. |
| Very early/late | Apply grace rules and window. | Late/Early Going/Present. | Rule change plus reconciliation. |
| Night/cross-midnight shift | Evaluation window extends beyond duty date. | In/out can cross dates. | Reconciliation scans 30-hour window. |
| Week off/holiday | Preserve Week Off/Holiday status with punches captured. | Week Off/Holiday actual. | Future OT rules can alter. |
| Approved/half-day leave | Leave wins over punches by default. | Leave/Half Day. | Manual override workflow future. |
| No roster | Skip as No Roster and audit. | No normal actual write beyond configured Miss Punch mapping. | Roster creation then reconciliation. |
| Roster changed | Next punch or reconciliation recomputes with latest roster. | Actual row overwritten by `MERGE`. | Night reconciliation fixes. |
| Device time drift/future/backdated | Unsafe punches excluded by rule bounds. | Invalid/Miss Punch as applicable. | Correct device and reconcile. |
| Wrong employee code | No roster/manual review. | Audit event retained. | HR correction then reconcile. |
| Oracle/Redis/server failure | Job retries, failed events retained. | No partial loss in PostgreSQL event store. | Retry or reconcile API. |
| Out-of-order/concurrent punches | Whole day recompute produces convergent result. | Last successful recompute wins. | Night reconciliation. |
| Punch after nightly batch | Realtime updates actual, next batch reconciles. | Actual row updated. | Coexists with HIS batch. |

## Environment

- `ATTENDANCE_REALTIME_ENABLED=false` disables listener.
- `ATTENDANCE_POLL_INTERVAL_MS=1500` controls latency/load.
- `ATTENDANCE_POLL_BATCH_SIZE=500` controls Oracle fetch size.
- `ATTENDANCE_LOOKBACK_MINUTES=120` controls first boot cursor.
- `ATTENDANCE_RECON_CRON="0 30 1 * * *"` controls reconciliation.
- `ATTENDANCE_RECON_BATCH_SIZE=5000` controls reconciliation volume.
