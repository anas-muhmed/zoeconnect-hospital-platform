# HDSP Token Management Module — Enterprise Architecture Design

**Version:** 1.0  
**Classification:** Internal Architecture Document  
**Platform:** Hospital Digital Services Platform (HDSP)  
**Stack:** NestJS (Backend) · Next.js (Frontend) · PostgreSQL · Redis · Socket.io

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Operating Modes](#2-operating-modes)
3. [Complete Database Schema](#3-complete-database-schema)
4. [ER Diagram Description](#4-er-diagram-description)
5. [Entity Relationships](#5-entity-relationships)
6. [Configuration Flow](#6-configuration-flow)
7. [Counter Flow](#7-counter-flow)
8. [Kiosk Flow](#8-kiosk-flow)
9. [Queue Display Flow](#9-queue-display-flow)
10. [Super Admin Configuration](#10-super-admin-configuration)
11. [Branch Admin Configuration](#11-branch-admin-configuration)
12. [API Design](#12-api-design)
13. [Permission Matrix](#13-permission-matrix)
14. [URL Generation Strategy](#14-url-generation-strategy)
15. [Token Generation Strategy](#15-token-generation-strategy)
16. [Scalability Considerations](#16-scalability-considerations)
17. [High Availability](#17-high-availability)
18. [Caching Strategy](#18-caching-strategy)
19. [Audit Logs](#19-audit-logs)
20. [Edge Cases](#20-edge-cases)
21. [Failure Scenarios](#21-failure-scenarios)
22. [Migration Strategy](#22-migration-strategy)
23. [Sequence Diagrams](#23-sequence-diagrams)
24. [State Diagrams](#24-state-diagrams)
25. [Recommended Database Indexes](#25-recommended-database-indexes)
26. [Folder Structure](#26-folder-structure)
27. [Backend Architecture](#27-backend-architecture)
28. [Frontend Architecture](#28-frontend-architecture)
29. [Multi-Tenant Architecture](#29-multi-tenant-architecture)
30. [Future Extensibility](#30-future-extensibility)
31. [Additional Scenarios](#31-additional-scenarios)

---

## 1. System Overview

The HDSP Token Management Module is an enterprise-grade patient queuing system that operates as a companion to an existing Hospital Information System (HIS). It supports two independent operating modes, multiple kiosk types, branch-level isolation, and real-time queue management.

### Core Principles

- **Backward Compatibility** — all existing HIS-dependent flows continue to work unchanged
- **Branch Independence** — every branch is a completely isolated tenant
- **Mode Flexibility** — each branch independently selects its operating mode
- **Permanent Kiosk URLs** — kiosk URLs never change; behavior is driven by database config
- **Real-Time** — all counter, kiosk, and display screens update via WebSocket
- **Resilience** — continues operating during HIS downtime (Location Based mode always; Service Center Based mode partially)

---

## 2. Operating Modes

### 2.1 Service Center Based (HIS Dependent)

```
HIS Oracle → Department List → Service Center List → Token Print
```

- Department and service center data fetched from HIS Oracle database
- Counters are mapped to service centers
- Kiosk skips department/SC selection based on kiosk configuration
- Falls back gracefully during HIS downtime

### 2.2 Location Based (HDSP Independent)

```
Admin Creates Locations → Assign Counters → Token Print
```

- Locations created manually by branch admin (e.g. "Ground Floor Reception", "Block A Billing")
- No HIS dependency at all
- Fully self-contained in PostgreSQL + Redis

### 2.3 Branch Mode Configuration

```
branch_id=1 → SERVICE_CENTER_BASED
branch_id=2 → LOCATION_BASED
branch_id=3 → SERVICE_CENTER_BASED
```

These never interfere. Every API, WebSocket room, and kiosk URL is scoped by `branch_id`.

---

## 3. Complete Database Schema

### 3.1 token_branch_config

Branch-level mode selection. One row per branch.

```sql
CREATE TABLE token_branch_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        VARCHAR(30) NOT NULL UNIQUE,
  mode             VARCHAR(30) NOT NULL DEFAULT 'LOCATION_BASED',
                   -- ENUM: SERVICE_CENTER_BASED | LOCATION_BASED
  daily_reset_time TIME NOT NULL DEFAULT '00:00:00',
  timezone         VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       VARCHAR(100)
);
```

### 3.2 token_kiosks

Permanent kiosk registry. One row per physical kiosk machine.

```sql
CREATE TABLE token_kiosks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     VARCHAR(30) NOT NULL,
  kiosk_slug    VARCHAR(12) NOT NULL UNIQUE,
                -- e.g. ABCD1234 — never changes
  name          VARCHAR(100) NOT NULL,
  kiosk_type    VARCHAR(20) NOT NULL,
                -- ENUM: MULTIPLE | SINGLE | DISPLAY_ONLY
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at   TIMESTAMPTZ,
  archived_by   VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    VARCHAR(100)
);
```

### 3.3 token_kiosk_assignments

Maps service centers or locations to kiosks. Supports merge.

```sql
CREATE TABLE token_kiosk_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id         UUID NOT NULL REFERENCES token_kiosks(id) ON DELETE CASCADE,
  branch_id        VARCHAR(30) NOT NULL,
  assignment_type  VARCHAR(20) NOT NULL,
                   -- ENUM: SERVICE_CENTER | LOCATION
  -- for SERVICE_CENTER mode:
  department_id    VARCHAR(30),
  department_name  VARCHAR(255),
  service_center_id   VARCHAR(30),
  service_center_name VARCHAR(255),
  intrabranchid    VARCHAR(30),
  -- for LOCATION mode:
  location_id      UUID REFERENCES token_locations(id),
  display_order    INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  merged_at        TIMESTAMPTZ,
  merged_by        VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.4 token_sc_configs

Per-service-center configuration (Service Center Based mode only).

```sql
CREATE TABLE token_sc_configs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            VARCHAR(30) NOT NULL,
  department_id        VARCHAR(30) NOT NULL,
  department_name      VARCHAR(255) NOT NULL,
  service_center_id    VARCHAR(30) NOT NULL,
  service_center_name  VARCHAR(255) NOT NULL,
  intrabranchid        VARCHAR(30),
  token_prefix         VARCHAR(10) NOT NULL DEFAULT '',
  start_number         INT NOT NULL DEFAULT 1,
  max_number           INT NOT NULL DEFAULT 999,
  reset_daily          BOOLEAN NOT NULL DEFAULT TRUE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, service_center_id)
);
```

### 3.5 token_locations

Manually created locations (Location Based mode).

```sql
CREATE TABLE token_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       VARCHAR(30) NOT NULL,
  code            VARCHAR(60) NOT NULL,
  label           VARCHAR(100) NOT NULL,
  building        VARCHAR(100),
  floor           VARCHAR(50),
  description     TEXT,
  token_prefix    VARCHAR(10) NOT NULL DEFAULT '',
  start_number    INT NOT NULL DEFAULT 1,
  max_number      INT NOT NULL DEFAULT 999,
  reset_daily     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- HIS mirror fields (for SC-based locations auto-created):
  intrabranchid        VARCHAR(30),
  department_id        VARCHAR(30),
  department_name      VARCHAR(255),
  service_center_id    VARCHAR(30),
  service_center_name  VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, code)
);
```

### 3.6 token_counters

Physical service counters. Belong to either a location or a service center.

```sql
CREATE TABLE token_counters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       VARCHAR(30) NOT NULL,
  reference_type  VARCHAR(20) NOT NULL,
                  -- ENUM: LOCATION | SERVICE_CENTER
  reference_id    VARCHAR(60) NOT NULL,
                  -- location.id or service_center_id
  counter_number  INT NOT NULL,
  label           VARCHAR(100),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  current_token   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, reference_type, reference_id, counter_number)
);
```

### 3.7 token_sequences

Daily token number sequence per service center / location. Atomic increment.

```sql
CREATE TABLE token_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       VARCHAR(30) NOT NULL,
  reference_type  VARCHAR(20) NOT NULL,
  reference_id    VARCHAR(60) NOT NULL,
  seq_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  current_number  INT NOT NULL DEFAULT 0,
  reset_at        TIMESTAMPTZ,
  UNIQUE (branch_id, reference_type, reference_id, seq_date)
);
-- Increment is done with: UPDATE ... SET current_number = current_number + 1 RETURNING current_number
-- Or via Redis INCR for high-frequency branches
```

### 3.8 token_records

Every token ever issued. The central fact table.

```sql
CREATE TABLE token_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        VARCHAR(30) NOT NULL,
  reference_type   VARCHAR(20) NOT NULL,
  reference_id     VARCHAR(60) NOT NULL,
  token_number     INT NOT NULL,
  token_prefix     VARCHAR(10) NOT NULL DEFAULT '',
  full_token       VARCHAR(20) NOT NULL,  -- e.g. "B-042"
  token_type       VARCHAR(20) NOT NULL DEFAULT 'WALK_IN',
                   -- ENUM: WALK_IN | VIP | APPOINTMENT | EMERGENCY | ONLINE
  priority         INT NOT NULL DEFAULT 100,
                   -- lower number = higher priority
  status           VARCHAR(20) NOT NULL DEFAULT 'WAITING',
                   -- ENUM: WAITING | CALLED | SERVING | COMPLETED |
                   --       MISSED | CANCELLED | ON_HOLD | RECALLED | SKIPPED | REISSUED
  counter_id       UUID REFERENCES token_counters(id),
  kiosk_id         UUID REFERENCES token_kiosks(id),
  appointment_id   VARCHAR(100),  -- HIS appointment reference
  called_by        VARCHAR(100),
  called_at        TIMESTAMPTZ,
  served_at        TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  estimated_wait_seconds INT,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Reissue tracking:
  reissued_from_id UUID REFERENCES token_records(id),
  reissued_to_id   UUID REFERENCES token_records(id)
);
```

### 3.9 token_calls

Audit trail for every operator action on a token.

```sql
CREATE TABLE token_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_record_id UUID NOT NULL REFERENCES token_records(id),
  counter_id      UUID REFERENCES token_counters(id),
  action          VARCHAR(20) NOT NULL,
                  -- ENUM: CALLED | RECALLED | TRANSFERRED | HELD |
                  --       SKIPPED | COMPLETED | CANCELLED | MISSED | REISSUED
  from_counter_id UUID REFERENCES token_counters(id),  -- for TRANSFERRED
  to_counter_id   UUID REFERENCES token_counters(id),  -- for TRANSFERRED
  performed_by    VARCHAR(100) NOT NULL,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);
```

### 3.10 token_display_pages

Queue display screen configurations.

```sql
CREATE TABLE token_display_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       VARCHAR(30) NOT NULL,
  slug            VARCHAR(60) NOT NULL UNIQUE,  -- e.g. "icu-floor-2"
  name            VARCHAR(100) NOT NULL,
  assignments     JSONB NOT NULL DEFAULT '[]',
                  -- [{type: LOCATION|SERVICE_CENTER, referenceId, label}]
  display_config  JSONB NOT NULL DEFAULT '{}',
                  -- theme, layout, scroll speed, language, etc.
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.11 token_display_config

Global key-value config store (print config, display theme, etc.).

```sql
CREATE TABLE token_display_config (
  id          VARCHAR(60) PRIMARY KEY,  -- e.g. 'print_global', 'display_global'
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(100)
);
```

### 3.12 token_kiosk_branding

Per-branch kiosk branding overrides.

```sql
CREATE TABLE token_kiosk_branding (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         VARCHAR(30) NOT NULL UNIQUE,
  hospital_name     VARCHAR(255),
  logo_url          VARCHAR(500),
  primary_color     VARCHAR(20) DEFAULT '#059669',
  secondary_color   VARCHAR(20) DEFAULT '#0f172a',
  background_url    VARCHAR(500),
  welcome_message   JSONB DEFAULT '{}',
                    -- {"en": "Welcome", "ar": "مرحبا", "ml": "സ്വാഗതം"}
  available_langs   TEXT[] DEFAULT ARRAY['en'],
  font_size_mode    VARCHAR(20) DEFAULT 'NORMAL',
                    -- NORMAL | LARGE | EXTRA_LARGE
  footer_text       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        VARCHAR(100)
);
```

### 3.13 token_analytics_daily

Pre-aggregated daily analytics per service center / location.

```sql
CREATE TABLE token_analytics_daily (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            VARCHAR(30) NOT NULL,
  reference_type       VARCHAR(20) NOT NULL,
  reference_id         VARCHAR(60) NOT NULL,
  analytics_date       DATE NOT NULL,
  total_issued         INT NOT NULL DEFAULT 0,
  total_called         INT NOT NULL DEFAULT 0,
  total_completed      INT NOT NULL DEFAULT 0,
  total_missed         INT NOT NULL DEFAULT 0,
  total_cancelled      INT NOT NULL DEFAULT 0,
  total_on_hold        INT NOT NULL DEFAULT 0,
  avg_wait_seconds     INT,
  avg_serve_seconds    INT,
  peak_hour            SMALLINT,  -- 0-23
  peak_hour_volume     INT,
  by_type              JSONB DEFAULT '{}',
                       -- {"WALK_IN": 120, "VIP": 5, "EMERGENCY": 2}
  by_counter           JSONB DEFAULT '{}',
                       -- {"1": {called: 40, completed: 38}, "2": {...}}
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, reference_type, reference_id, analytics_date)
);
```

### 3.14 token_audit_logs

Complete audit trail for all configuration changes.

```sql
CREATE TABLE token_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    VARCHAR(30),
  entity_type  VARCHAR(60) NOT NULL,  -- e.g. 'token_kiosk', 'token_branch_config'
  entity_id    VARCHAR(100),
  action       VARCHAR(30) NOT NULL,  -- CREATE | UPDATE | DELETE | ARCHIVE
  changed_by   VARCHAR(100) NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  before_state JSONB,
  after_state  JSONB,
  ip_address   VARCHAR(45),
  user_agent   TEXT
);
```

---

## 4. ER Diagram Description

```
┌─────────────────────┐
│  token_branch_config │  1 per branch — stores mode
│  branch_id (UK)      │
└──────────┬──────────┘
           │ 1
           │
           │ N
┌──────────▼──────────┐       ┌───────────────────────┐
│   token_kiosks       │ 1   N │ token_kiosk_assignments│
│   branch_id          ├───────►  kiosk_id (FK)         │
│   kiosk_slug (UK)    │       │  location_id (FK?)      │
│   kiosk_type         │       │  service_center_id?     │
└──────────────────────┘       └───────────┬───────────┘
                                            │ N
                                            │ 1
                          ┌─────────────────▼─────────┐
                          │     token_locations         │ (LOCATION mode)
                          │     branch_id               │
                          │     code (UK per branch)    │
                          └─────────────┬───────────────┘
                                        │ 1
                                        │ N
                          ┌─────────────▼───────────────┐
                          │     token_counters            │
                          │     branch_id                 │
                          │     reference_type            │
                          │     reference_id              │
                          │     counter_number            │
                          └─────────────┬───────────────┘
                                        │ 1
                                        │ N
                          ┌─────────────▼───────────────┐
                          │     token_records             │
                          │     branch_id                 │
                          │     full_token                │
                          │     status                    │
                          └─────────────┬───────────────┘
                                        │ 1
                                        │ N
                          ┌─────────────▼───────────────┐
                          │     token_calls               │
                          │     action                    │
                          │     performed_by              │
                          └───────────────────────────────┘

┌──────────────────────┐       ┌───────────────────────┐
│  token_sequences      │       │  token_display_pages   │
│  branch_id            │       │  branch_id             │
│  reference_type       │       │  slug (UK)             │
│  reference_id         │       │  assignments (jsonb)   │
│  seq_date             │       └───────────────────────┘
│  current_number       │
└──────────────────────┘
```

---

## 5. Entity Relationships

| Parent | Child | Cardinality | Notes |
|---|---|---|---|
| branch | token_branch_config | 1:1 | One config per branch |
| branch | token_kiosks | 1:N | Branch owns kiosks |
| token_kiosks | token_kiosk_assignments | 1:N | Kiosk serves N locations/SCs |
| token_locations | token_kiosk_assignments | 1:N | A location can appear in multiple kiosks |
| token_locations | token_counters | 1:N | Location has N counters |
| token_counters | token_records | 1:N | Counter serves N tokens |
| token_records | token_calls | 1:N | Token has N action history entries |
| token_records | token_sequences | N:1 | Tokens share a daily sequence |
| token_records | token_records | 1:1 | Self-referential for reissue |
| branch | token_display_pages | 1:N | Branch has N display screens |
| branch | token_kiosk_branding | 1:1 | One branding config per branch |

---

## 6. Configuration Flow

### 6.1 Mode Selection

```
Super Admin / Branch Admin
        │
        ▼
System → Configuration → Token Management
        │
        ├── Mode: [SERVICE_CENTER_BASED] [LOCATION_BASED]
        │
        └── (saves to token_branch_config)
```

### 6.2 Service Center Based — First-Time Setup

```
Branch Admin selects: SERVICE_CENTER_BASED
        │
        ▼
"Configure Service Centers"
        │
        ▼
For each service center:
  1. Select Department (from HIS via GET /token/his/departments?branchId=X)
  2. Select Service Center (from HIS via GET /token/his/service-centers?branchId=X&deptId=Y)
  3. Set Token Prefix (e.g. "R" for Radiology → R-001)
  4. Select Kiosk Mode:
        │
        ├── MULTIPLE → System generates unique kiosk slug (ABCD1234)
        │              Stores in token_kiosks + token_kiosk_assignments
        │              Displays URL: /kiosk/ABCD1234 + QR Code
        │
        ├── SINGLE   → Admin selects existing Single Kiosk OR creates new one
        │              Assignment added to token_kiosk_assignments
        │              No new URL generated if adding to existing
        │
        └── MERGE INTO → Admin selects any existing kiosk
                         New assignment row added to token_kiosk_assignments
                         Existing kiosk URL starts serving this SC too
```

### 6.3 Location Based — First-Time Setup

```
Branch Admin selects: LOCATION_BASED
        │
        ▼
"Manage Locations"
        │
        ▼
Create Location:
  1. Label (e.g. "Ground Floor Billing")
  2. Building / Floor (optional)
  3. Token Prefix (e.g. "G")
  4. Select Kiosk Mode: MULTIPLE | SINGLE | MERGE INTO
        │
        └── (same kiosk assignment flow as SC Based)

Add Counters to Location:
  1. Counter Number (1, 2, 3...)
  2. Counter Label (optional, e.g. "Counter 1A")
```

---

## 7. Counter Flow

### 7.1 Operator Login Flow

```
Operator logs in (JWT issued with activeBranchId)
        │
        ▼
Token Management → Counter Dashboard
        │
        ▼
[IF SERVICE_CENTER_BASED]
  Select Department → Select Service Center → Select Counter Number → Join
        │
[IF LOCATION_BASED]
  Select Location → Select Counter Number → Join
        │
        ▼
WebSocket connection established:
  - Joins room: branch:{branchId}
  - Joins room: counter:{counterId}
  - Receives current queue state
        │
        ▼
COUNTER LOCKED — Operator is now live
```

### 7.2 Token Calling Flow

```
Operator sees WAITING tokens in their queue
        │
        ▼
Click "Call Next" (or press Space/Enter)
        │
        ▼
System selects next WAITING token by priority:
  Priority 1: EMERGENCY
  Priority 2: APPOINTMENT
  Priority 3: VIP
  Priority 4: WALK_IN
  Priority 5: ONLINE
        │
        ▼
token_records status → CALLED
token_calls INSERT (action=CALLED)
        │
        ▼
WebSocket broadcast:
  - branch:{id} room → token:called payload
  - display screens refresh
  - announcement (audio TTS)
        │
        ▼
Operator serves patient
        │
        ▼
Actions available:
  COMPLETE  → status=COMPLETED, served_at=NOW()
  HOLD      → status=ON_HOLD (returns to queue, lower priority)
  SKIP      → status=SKIPPED
  TRANSFER  → assigns to another counter, re-queued
  RECALL    → re-calls current token (plays announcement again)
  CANCEL    → status=CANCELLED
  MISS      → status=MISSED (no-show)
```

### 7.3 Special Token Operations

- **Recall** — Re-broadcast the call event; status stays CALLED
- **Hold** — Token returns to queue with priority downgraded by 50
- **Skip** — Moves to next token; skipped token stays SKIPPED
- **Transfer** — Creates a new token_calls entry with from_counter + to_counter
- **Reissue** — Creates a NEW token_record linked via reissued_from_id; old token→REISSUED
- **Counter Reset** — Clears current_token on counter; does not affect token_records

---

## 8. Kiosk Flow

### 8.1 Multiple Kiosk (Direct Print)

```
Patient opens /kiosk/ABCD1234
        │
        ▼
System loads: token_kiosks WHERE kiosk_slug='ABCD1234'
  → kiosk_type = MULTIPLE
  → assignments: [{service_center_id: 'SC_42', ...}]  (always exactly 1)
        │
        ▼
Screen shows:
  [Hospital Logo]
  [Service Center Name: "Registration"]
  [Next Token: 047]
  [Currently Waiting: 12]
  [PRINT TOKEN Button]
        │
        ▼
Patient taps PRINT TOKEN
        │
        ▼
POST /token/kiosk/{kioskSlug}/issue
  → Atomically increments token_sequences
  → Inserts token_records (status=WAITING, type=WALK_IN)
  → Broadcasts token:issued to branch:{branchId}
  → Returns { tokenNumber: 47, fullToken: "R-047", ... }
        │
        ▼
Screen shows print slip → window.print()
  [Token: R-047]
  [Registration]
  [Please wait for your token to be called]
        │
        ▼
Returns to home screen after 3 seconds
```

### 8.2 Single Kiosk (Selection → Print)

```
Patient opens /kiosk/KIOSK01
        │
        ▼
System loads kiosk → kiosk_type = SINGLE
  assignments: [SC_1 "Registration", SC_2 "Laboratory", SC_3 "Radiology"]
        │
        ▼
Screen shows:
  "Choose your service"
  [Registration] [12 waiting]
  [Laboratory  ] [4 waiting]
  [Radiology   ] [8 waiting]
        │
        ▼
Patient selects "Laboratory"
        │
        ▼
Confirm screen:
  [Laboratory]
  [Next Token: L-018]
  [PRINT TOKEN]
        │
        ▼
Same issue flow as MULTIPLE
```

### 8.3 Merge Into

```
During configuration:
  Admin creates a new service center "Pharmacy"
  Selects: Kiosk Mode = MERGE INTO
  Selects: Existing Single Kiosk "KIOSK01"

System:
  INSERT INTO token_kiosk_assignments (kiosk_id=KIOSK01, sc=Pharmacy)
  No new kiosk created. No new URL.

Result:
  /kiosk/KIOSK01 now shows:
  [Registration] [Laboratory] [Radiology] [Pharmacy]
```

### 8.4 Kiosk State Machine

```
CREATED → ACTIVE → ARCHIVED
              ↑
          DISABLED → ACTIVE (re-enable)
```

Archived kiosks retain all historical data but the URL returns 410 Gone.
Disabled kiosks show a maintenance screen.

---

## 9. Queue Display Flow

### 9.1 Display Page Configuration

Each display board has a slug (e.g. `/display/icu-floor-2`) and an assignments list. The assignments can mix service centers and locations:

```json
{
  "assignments": [
    { "type": "SERVICE_CENTER", "referenceId": "SC_42", "label": "Registration" },
    { "type": "SERVICE_CENTER", "referenceId": "SC_43", "label": "Laboratory" }
  ],
  "displayConfig": {
    "layout": "SPLIT_2",
    "scrollSpeed": 3,
    "theme": "dark",
    "showWaitingCount": true,
    "showCalledRecent": 5,
    "language": "en",
    "autoAnnounce": true
  }
}
```

### 9.2 Display Update Flow

```
Operator calls token
        │
        ▼
WebSocket event: token:called → branch:{branchId}
        │
        ▼
All display boards connected to this branch receive event
        │
        ▼
Display filters by its own assignment list
  → Only shows updates for its assigned service centers / locations
        │
        ▼
Updates "Now Serving" panel
Updates "Recently Called" scroll list
Triggers audio TTS (if configured)
```

### 9.3 Display Layout Options

- `FULL` — Single service center, fullscreen current token
- `SPLIT_2` — 2 service centers side by side
- `SPLIT_3` — 3 columns
- `GRID_4` — 2×2 grid
- `TICKER` — Bottom scroll bar with recent calls (for supplementary screens)

---

## 10. Super Admin Configuration

Super Admins have global access across all branches.

**Accessible via:** System → Token Management → Global Settings

| Setting | Description |
|---|---|
| Enable/Disable Token Module | Global module toggle |
| License management | Module license per branch |
| Global display theme | Default theme (branches can override) |
| Global print config | Default receipt layout |
| Audit log viewer | Across all branches |
| Kiosk URL format | Slug length, character set |
| Analytics dashboard | Cross-branch aggregated view |

---

## 11. Branch Admin Configuration

Branch Admins can configure only their own branch.

**Accessible via:** System → Configuration → Token Management

### 11.1 Mode Tab

- Select mode: SERVICE_CENTER_BASED / LOCATION_BASED
- Set daily reset time and timezone
- Warning shown if mode change affects live counters

### 11.2 Service Centers Tab (SC Based mode only)

Table of configured service centers with columns:

| Column | Description |
|---|---|
| Department | HIS department name |
| Service Center | HIS service center name |
| Prefix | Token prefix (e.g. "R") |
| Kiosk Mode | MULTIPLE / SINGLE / MERGE INTO |
| Kiosk | Linked kiosk name |
| Kiosk URL | /kiosk/ABCD1234 with Copy + QR buttons |
| Active | Toggle |
| Actions | Edit, Delete |

### 11.3 Locations Tab (Location Based mode only)

Same table structure but with Location instead of SC.

### 11.4 Kiosks Tab

List of all kiosks for this branch:

| Column | Description |
|---|---|
| Name | Kiosk name |
| Type | MULTIPLE / SINGLE |
| URL | /kiosk/SLUG with Copy + QR |
| Assigned To | List of SC/Location names |
| Status | Active / Disabled / Archived |
| Actions | View QR, Disable, Archive, Move assignments |

### 11.5 Counters Tab

All counters grouped by location/service center.

### 11.6 Display Boards Tab

List of display page slugs with assignment configuration.

### 11.7 Branding Tab

Logo, colors, welcome message (multilingual), font size mode.

### 11.8 Prefix & Numbering Tab

Per-location/SC prefix configuration, start number, max number, reset schedule.

---

## 12. API Design

All authenticated endpoints require JWT with `activeBranchId` claim.  
Public endpoints (kiosk, display) are marked `@Public()`.

### 12.1 Config APIs

```
GET    /token/config                          Branch config summary
GET    /token/config/mode                     Get branch mode
PUT    /token/config/mode                     Set branch mode
GET    /token/config/branding                 Get branch branding
PUT    /token/config/branding                 Update branch branding
GET    /token/config/prefix/:referenceId      Get prefix config
PUT    /token/config/prefix/:referenceId      Update prefix config
```

### 12.2 Service Center Config APIs

```
GET    /token/sc-configs                      List configured SCs
POST   /token/sc-configs                      Configure a new SC
PATCH  /token/sc-configs/:id                  Update SC config
DELETE /token/sc-configs/:id                  Remove (soft)
```

### 12.3 Kiosk APIs

```
GET    /token/kiosks                          List kiosks (branch-scoped)
POST   /token/kiosks                          Create kiosk (generates slug)
GET    /token/kiosks/:slug                    Get kiosk detail
PATCH  /token/kiosks/:slug                    Update kiosk name/status
POST   /token/kiosks/:slug/assignments        Add SC/location to kiosk (merge)
DELETE /token/kiosks/:slug/assignments/:id    Remove assignment
POST   /token/kiosks/:slug/disable            Disable kiosk
POST   /token/kiosks/:slug/archive            Archive kiosk
GET    /token/kiosks/:slug/qr                 Get QR code (PNG or SVG)

-- Public (no auth):
GET    /kiosk/:slug                           Public kiosk config (type + assignments + branding)
POST   /kiosk/:slug/issue                     Issue token from kiosk
GET    /kiosk/:slug/state                     Real-time queue state for this kiosk
```

### 12.4 Location APIs

```
GET    /token/locations                       List active locations (branch-scoped)
GET    /token/locations/all                   All incl. inactive
POST   /token/locations                       Create location
PATCH  /token/locations/:id                   Update location
PATCH  /token/locations/:id/toggle            Toggle active
DELETE /token/locations/:id                   Soft delete
```

### 12.5 Counter APIs

```
GET    /token/counters                        List counters
POST   /token/counters                        Create counter
PATCH  /token/counters/:id                    Update counter
DELETE /token/counters/:id                    Deactivate counter
GET    /token/counters/:id/state              Live counter state
```

### 12.6 Token Operation APIs (REST fallback for WebSocket)

```
POST   /token/call                            Call a token
POST   /token/recall/:recordId                Recall token
POST   /token/hold/:recordId                  Hold token
POST   /token/skip/:recordId                  Skip token
POST   /token/complete/:recordId              Complete token
POST   /token/cancel/:recordId                Cancel token
POST   /token/transfer/:recordId              Transfer to another counter
POST   /token/reissue/:recordId               Reissue token (new number)
GET    /token/queue/:referenceType/:referenceId  Current queue state
```

### 12.7 Display APIs

```
GET    /token/displays                        List display pages
POST   /token/displays                        Create display page
PATCH  /token/displays/:id                    Update display page
DELETE /token/displays/:id                    Delete display page

-- Public:
GET    /display/:slug                         Public display page config
```

### 12.8 HIS Lookup APIs (pass-through)

```
GET    /token/his/departments?branchId=       HIS department list
GET    /token/his/service-centers?branchId=&deptId=  HIS SC list
```

### 12.9 Analytics APIs

```
GET    /token/analytics/summary?date=         Daily summary
GET    /token/analytics/volume?from=&to=      Volume over time
GET    /token/analytics/wait-times?date=      Wait time breakdown
GET    /token/analytics/counter-perf?date=    Counter performance
GET    /token/analytics/export?from=&to=&format=csv  Export
```

---

## 13. Permission Matrix

| Permission | SUPER_ADMIN | HOSPITAL_ADMIN | BRANCH_MANAGER | OPERATOR | RECEPTIONIST |
|---|:---:|:---:|:---:|:---:|:---:|
| TOKEN:CONFIG:READ | ✓ | ✓ | ✓ | - | - |
| TOKEN:CONFIG:WRITE | ✓ | ✓ | - | - | - |
| TOKEN:KIOSK:MANAGE | ✓ | ✓ | - | - | - |
| TOKEN:KIOSK:VIEW | ✓ | ✓ | ✓ | - | - |
| TOKEN:LOCATION:MANAGE | ✓ | ✓ | - | - | - |
| TOKEN:COUNTER:READ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TOKEN:COUNTER:OPERATE | ✓ | ✓ | ✓ | ✓ | - |
| TOKEN:COUNTER:MANAGE | ✓ | ✓ | ✓ | - | - |
| TOKEN:ISSUE:MANUAL | ✓ | ✓ | ✓ | - | ✓ |
| TOKEN:ANALYTICS:READ | ✓ | ✓ | ✓ | - | - |
| TOKEN:ANALYTICS:EXPORT | ✓ | ✓ | - | - | - |
| TOKEN:DISPLAY:MANAGE | ✓ | ✓ | ✓ | - | - |
| TOKEN:BRANDING:MANAGE | ✓ | ✓ | - | - | - |
| TOKEN:AUDIT:READ | ✓ | ✓ | - | - | - |

---

## 14. URL Generation Strategy

### 14.1 Kiosk Slug Format

```
Format:  [A-Z0-9]{8}   (e.g. ABCD1234, X7R9K2M5)
Length:  8 characters
Space:   36^8 ≈ 2.8 trillion combinations
```

**Generation Algorithm:**

```typescript
import { customAlphabet } from 'nanoid';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Excludes: I, O, 0, 1 — to prevent misreading on kiosk screens

const generateKioskSlug = customAlphabet(alphabet, 8);

async function createUniqueKioskSlug(repo: Repository<TokenKiosk>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateKioskSlug();
    const exists = await repo.findOne({ where: { kioskSlug: slug } });
    if (!exists) return slug;
  }
  throw new Error('Could not generate unique kiosk slug after 10 attempts');
}
```

### 14.2 Display Page Slug Format

```
Format:  kebab-case, admin-defined, human-readable
Example: icu-floor-2, opd-waiting-area, main-lobby
Validation: /^[a-z0-9-]{3,60}$/
Uniqueness: checked against entire token_display_pages table
```

### 14.3 QR Code Generation

```
URL encoded: https://{hospital-domain}/kiosk/{slug}
QR format:   SVG (scalable) or PNG (for printing)
Generated:   on-demand via GET /token/kiosks/:slug/qr?format=svg
Library:     qrcode npm package
Error level: M (allows up to 15% damage)
```

### 14.4 Security Considerations

- Kiosk slugs are not guessable by design (base-32, 8 chars)
- No auth required to load kiosk page — the slug IS the access token
- Kiosk can only issue tokens (write) — it cannot read other kiosks' data
- Optionally: add a branch-specific secret header for kiosk issue requests

---

## 15. Token Generation Strategy

### 15.1 Token Format

```
{PREFIX}-{ZERO_PADDED_NUMBER}

Examples:
  R-001  (Radiology, token 1)
  L-042  (Laboratory, token 42)
  G-100  (Ground Floor, token 100)
  E-001  (Emergency, token 1 — separate sequence)
```

### 15.2 Prefix Rules (configurable per service center / location)

| Type | Default Prefix | Example |
|---|---|---|
| WALK_IN | (location prefix) | R-042 |
| VIP | V | V-003 |
| EMERGENCY | E | E-001 |
| APPOINTMENT | A | A-015 |
| ONLINE | O | O-008 |

Each type uses its own daily sequence if prefixes differ.

### 15.3 Atomic Sequence Generation

```typescript
// Redis-backed for high-frequency branches:
async function issueNextToken(branchId: string, referenceId: string): Promise<number> {
  const key = `token:seq:${branchId}:${referenceId}:${today()}`;
  const num = await redis.incr(key);
  if (num === 1) {
    // First token of the day — set expiry to midnight + buffer
    await redis.expireat(key, nextMidnightUnix() + 3600);
    // Also persist to token_sequences for audit
    await upsertSequenceRecord(branchId, referenceId, num);
  }
  return num;
}
```

For branches not needing Redis, fall back to PostgreSQL atomic update:

```sql
UPDATE token_sequences
   SET current_number = current_number + 1
 WHERE branch_id = $1 AND reference_id = $2 AND seq_date = CURRENT_DATE
RETURNING current_number;
```

### 15.4 Daily Reset

A scheduled NestJS `@Cron` job runs at each branch's configured reset time:

```typescript
@Cron(CronExpression.EVERY_MINUTE)
async handleDailyReset() {
  const configs = await this.configRepo.find();
  for (const config of configs) {
    const now = toZonedTime(new Date(), config.timezone);
    if (isResetTime(now, config.dailyResetTime)) {
      await this.resetBranchSequences(config.branchId);
    }
  }
}
```

Reset actions:
1. Flush Redis sequence keys for the branch
2. Set all token_records WAITING/CALLED → MISSED (uncompleted)
3. Clear counter current_token values
4. Broadcast reset event via WebSocket to all branch clients

### 15.5 Priority Ordering

```typescript
const PRIORITY_MAP: Record<TokenType, number> = {
  EMERGENCY:   10,
  APPOINTMENT: 30,
  VIP:         50,
  ONLINE:      70,
  WALK_IN:     100,
};

// ON_HOLD tokens get their original priority + 50 (deprioritized)
```

---

## 16. Scalability Considerations

### 16.1 Horizontal Scaling

- **Backend:** Stateless NestJS instances behind a load balancer
- **WebSocket:** Socket.io with Redis adapter (`@socket.io/redis-adapter`) for cross-instance pub/sub
- **Token sequences:** Redis INCR (atomic, distributed-safe)
- **Database:** PostgreSQL with read replicas for analytics queries

### 16.2 WebSocket Room Strategy

```
Room: branch:{branchId}           — all operators + kiosks in branch
Room: counter:{counterId}         — specific counter operator
Room: display:{displayPageSlug}   — specific display board
Room: kiosk:{kioskSlug}           — specific kiosk machine
```

Events flow branch-room → display boards filter locally by their assignment list.

### 16.3 Database Partitioning

`token_records` partitioned by `issued_at` month:

```sql
CREATE TABLE token_records_2024_01 PARTITION OF token_records
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

Analytics queries hit only the relevant partition.

### 16.4 Throughput Estimates

| Scenario | Tokens/day | Tokens/sec (peak) | WebSocket events/sec |
|---|---|---|---|
| Small branch | 500 | 2 | 10 |
| Medium branch | 5,000 | 20 | 100 |
| Large branch | 50,000 | 200 | 1,000 |
| Enterprise (10 branches) | 500,000 | 2,000 | 10,000 |

Redis + Socket.io handles 10,000+ events/sec on a single node. Above that, add Redis Cluster and multiple Socket.io nodes.

---

## 17. High Availability

### 17.1 Component HA

| Component | Strategy |
|---|---|
| PostgreSQL | Primary + read replica; failover via Patroni or AWS RDS Multi-AZ |
| Redis | Redis Sentinel (3 nodes) or Redis Cluster |
| NestJS | Multiple instances behind Nginx/HAProxy |
| Next.js | Deployed to Vercel/CDN or multiple Node instances |

### 17.2 Kiosk Offline Resilience

- Kiosk caches the last-known queue state in localStorage
- If API is unreachable for > 5s, shows: "System temporarily unavailable. Please try again."
- If printer is offline: shows error, does NOT increment token counter
- Token is only incremented AFTER successful print confirmation

### 17.3 HIS Downtime Handling

**Service Center Based mode during HIS downtime:**
- Department / SC lists cached in Redis (TTL: 4 hours)
- If Redis cache also empty: show cached list from last DB snapshot
- Token ISSUANCE continues normally (token_sequences is HDSP-local)
- HIS insertions (PRINT_DATA_DETAIL) are queued and retried when HIS returns

**Retry queue for HIS inserts:**

```typescript
// Bull queue job for HIS print record retry
@Processor('his-bridge')
export class HisBridgeProcessor {
  @Process('insertPrintRecord')
  async handleInsert(job: Job<PrintDataDetailPayload>) {
    await this.oracle.execute(INSERT_SQL, job.data);
  }
}
```

---

## 18. Caching Strategy

| Data | Cache Key | TTL | Invalidation |
|---|---|---|---|
| Branch mode config | `config:mode:{branchId}` | 5 min | On mode change |
| HIS department list | `his:depts:{branchId}` | 4 hours | Manual purge |
| HIS service center list | `his:scs:{branchId}:{deptId}` | 4 hours | Manual purge |
| Kiosk config | `kiosk:{slug}` | 30 min | On kiosk update |
| Queue state (location) | `queue:{branchId}:{refId}` | Real-time via WS | On every token event |
| Token sequence | `token:seq:{branchId}:{refId}:{date}` | Until midnight | Daily reset |
| Print config | `config:print:{branchId}` | 10 min | On config save |

**Cache warming:** On server start, warm kiosk config cache for all active kiosks.

---

## 19. Audit Logs

Every write operation inserts into `token_audit_logs`:

```typescript
@Injectable()
export class AuditService {
  async log(entry: {
    branchId?: string;
    entityType: string;
    entityId?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE';
    changedBy: string;
    beforeState?: object;
    afterState?: object;
    ipAddress?: string;
  }) {
    await this.auditRepo.save(this.auditRepo.create(entry));
  }
}
```

**Audited operations:**
- Branch mode change
- Kiosk creation, update, archive
- Kiosk assignment add/remove (merge in/out)
- Location create/update/delete
- Service center config changes
- Counter create/deactivate
- Display page changes
- Branding changes
- Daily reset execution
- Token manual cancel/reissue by admin

Audit logs are immutable (no UPDATE/DELETE on the table).  
Retention policy: 2 years (configurable).

---

## 20. Edge Cases

### 20.1 Token Generation

| Edge Case | Handling |
|---|---|
| Token reaches max number (999) | Roll over to 1 with a warning notification to branch admin |
| Concurrent issue requests | Redis INCR is atomic; no duplicates possible |
| Kiosk issues token but printer fails | Return error; do NOT increment sequence (transactional) |
| HIS SC deleted after kiosk configured | Kiosk shows SC from local config cache; flag in admin UI |
| Two kiosks simultaneously issuing | Redis INCR handles this; token_records insert is idempotent |

### 20.2 Kiosk Management

| Edge Case | Handling |
|---|---|
| Admin tries to delete active kiosk | Block delete; only allow archive |
| Kiosk assignment removed while kiosk is live | Kiosk refreshes assignment list every 30s; shows updated list |
| Merge into a MULTIPLE kiosk | Blocked by validation — MULTIPLE kiosk accepts exactly one assignment |
| A service center merged into 2 different kiosks | Allowed; both kiosks can issue tokens for same SC |
| Branch mode switched from SC to Location with live counters | Show warning; require admin confirmation; counters stay active until operator leaves |

### 20.3 Counter Operations

| Edge Case | Handling |
|---|---|
| Operator disconnects mid-call | Token stays CALLED; websocket reconnect restores session |
| Two operators try to call same token | Redis SETNX lock on token:lock:{recordId}; second caller gets "Already called" error |
| Transfer to a counter that has no operator | Allowed; token sits in that counter's WAITING queue |
| Reset counter while tokens are waiting | Only resets current_token display; WAITING tokens remain in queue |
| Operator session expires (JWT) | WS disconnected; session preserved in Redis for 30 min reconnect window |

---

## 21. Failure Scenarios

### 21.1 Database Failure

**Symptom:** PostgreSQL connection lost  
**Impact:** No new configurations can be saved; token issuance fails if Redis also down  
**Mitigation:**  
- Read-only mode: serve cached queue state from Redis  
- Queue token issuance to Bull/Redis; persist to DB on recovery  
- Alert admin via notification

### 21.2 Redis Failure

**Symptom:** Redis connection lost  
**Impact:** Token sequence increments fall back to PostgreSQL atomic UPDATE  
**Mitigation:**  
- `token_sequences` table handles fallback automatically  
- WebSocket connections degrade (no cross-instance pub/sub); local broadcasts still work  
- HIS bridge queue jobs accumulate in memory (capped at 1000)

### 21.3 WebSocket Gateway Failure

**Symptom:** Socket.io namespace crashes  
**Impact:** Operators see "Reconnecting…"; displays freeze  
**Mitigation:**  
- Socket.io auto-reconnects with exponential backoff  
- Operators can still call tokens via REST fallback endpoints  
- Displays poll GET /token/queue/:id every 5s as fallback

### 21.4 Printer Failure

**Symptom:** Browser print dialog fails or printer offline  
**Impact:** Patient sees error; token is not issued  
**Mitigation:**  
- Token issuance and print are decoupled: issue first, print separately  
- Kiosk shows "Printer offline" warning BEFORE patient confirms  
- Operator can issue token manually from dashboard for patient  
- Printer status checked via browser navigator.printing API (where supported)

### 21.5 HIS Oracle Failure

**Symptom:** Oracle connection pool times out  
**Impact:** Department/SC lists unavailable for new kiosk config; token issuance unaffected  
**Mitigation:**  
- All issued tokens still work (local sequences)  
- Dept/SC lists served from Redis cache (4h TTL)  
- PRINT_DATA_DETAIL inserts queued via Bull for retry  
- Admin sees HIS status indicator in config UI

---

## 22. Migration Strategy

### 22.1 From Current State

The current system has: `token_locations`, `token_counters`, `token_calls`, `token_display_config`, `display_pages` tables.

**Migration steps:**

1. **Run migration** `CreateTokenBranchConfig` — default all branches to `LOCATION_BASED`
2. **Run migration** `CreateTokenKiosks` — create kiosk tables
3. **Run migration** `CreateTokenScConfigs` — SC config table for HIS mode
4. **Run migration** `CreateTokenRecords` — replace ephemeral Redis-only data with persistent records
5. **Run migration** `CreateTokenKioskBranding` — branding table
6. **Run migration** `CreateTokenAnalyticsDaily` — analytics table
7. **Run migration** `CreateTokenAuditLogs` — audit table
8. **Data migration** — existing `token_locations` get default `LOCATION_BASED` mode; no data loss

### 22.2 Mode Switch Migration

When a branch switches from LOCATION_BASED to SERVICE_CENTER_BASED:
1. Existing WAITING tokens are allowed to complete
2. New tokens use SC-based sequences
3. Locations remain in DB (archived, not deleted)
4. Counter assignments are preserved but may need to be re-mapped

### 22.3 Backward Compatibility Guarantee

- `GET /token/public/state` continues to work (returns location-based state for LOCATION_BASED branches)
- Existing kiosk URLs (`/token/print-kiosk`) continue to work indefinitely
- Existing display slugs continue to work
- All existing API endpoints remain — new endpoints are additive

---

## 23. Sequence Diagrams

### 23.1 Token Issue (Multiple Kiosk)

```
Patient        Kiosk UI        API              Redis         PostgreSQL
  │               │              │                │               │
  │  Opens URL    │              │                │               │
  │──────────────►│              │                │               │
  │               │  GET /kiosk/:slug             │               │
  │               │─────────────►│                │               │
  │               │              │ GET kiosk:slug │               │
  │               │              │───────────────►│               │
  │               │              │  (cache hit)   │               │
  │               │              │◄───────────────│               │
  │               │◄─────────────│                │               │
  │               │              │                │               │
  │  Taps PRINT   │              │                │               │
  │──────────────►│              │                │               │
  │               │  POST /kiosk/:slug/issue      │               │
  │               │─────────────►│                │               │
  │               │              │  INCR seq key  │               │
  │               │              │───────────────►│               │
  │               │              │◄── tokenNum=47 │               │
  │               │              │                │               │
  │               │              │   INSERT token_records         │
  │               │              │───────────────────────────────►│
  │               │              │◄───────────────────────────────│
  │               │              │                │               │
  │               │              │  PUBLISH branch:{id} token:issued
  │               │              │───────────────►│               │
  │               │◄─────────────│                │               │
  │               │  window.print()               │               │
  │◄──────────────│              │                │               │
```

### 23.2 Operator Token Call

```
Operator     Counter UI      WS Gateway       TokenService      Redis
  │               │               │                │               │
  │  Space key    │               │                │               │
  │──────────────►│               │                │               │
  │               │  token:call   │                │               │
  │               │──────────────►│                │               │
  │               │               │  callToken()   │               │
  │               │               │───────────────►│               │
  │               │               │                │ SADD calledSet
  │               │               │                │───────────────►
  │               │               │                │ UPDATE counter │
  │               │               │                │───────────────►
  │               │               │                │ INSERT call    │
  │               │               │                │───────────────►
  │               │               │◄───────────────│               │
  │               │               │  broadcastTokenCalled()        │
  │               │               │  → branch:{id} room            │
  │               │◄──────────────│               │               │
  │◄──────────────│               │               │               │
  │  (announces)  │               │               │               │
```

---

## 24. State Diagrams

### 24.1 Token Status State Machine

```
                    ┌──────────┐
           issue    │          │
    ───────────────►│ WAITING  │
                    │          │
                    └──┬───┬───┘
                       │   │ skip
                  call │   └──────────► SKIPPED
                       │
                    ┌──▼───────┐
                    │          │
                    │  CALLED  │◄──────────────────┐
                    │          │                    │ recall
                    └──┬───┬───┘                    │
               serve │   │ no-show            ┌─────┴────┐
                     │   └──────────► MISSED ─┤  (admin) │
                     │                         └──────────┘
                  ┌──▼───────┐
                  │          │
                  │ SERVING  │
                  │          │
                  └──┬───┬───┘
            complete │   │ hold
                     │   └──────────► ON_HOLD ──────► WAITING (re-queued)
                  ┌──▼───────┐
                  │          │
                  │COMPLETED │
                  │          │
                  └──────────┘

  WAITING ──────────────────────────────────────► CANCELLED (admin action)
  CALLED  ──────────────────────────────────────► CANCELLED (admin action)
  COMPLETED / MISSED ───────────────────────────► REISSUED  (new record created)
```

### 24.2 Kiosk Status State Machine

```
  CREATE ──────────► ACTIVE ──────────► DISABLED ──────────► ACTIVE
                       │                                         │
                       │                                         │
                       └──────────────► ARCHIVED ◄──────────────┘
                                        (final; URL returns 410)
```

---

## 25. Recommended Database Indexes

```sql
-- token_branch_config
CREATE UNIQUE INDEX idx_tbc_branch ON token_branch_config (branch_id);

-- token_kiosks
CREATE UNIQUE INDEX idx_tk_slug     ON token_kiosks (kiosk_slug);
CREATE INDEX idx_tk_branch          ON token_kiosks (branch_id, is_active);

-- token_kiosk_assignments
CREATE INDEX idx_tka_kiosk          ON token_kiosk_assignments (kiosk_id);
CREATE INDEX idx_tka_location       ON token_kiosk_assignments (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_tka_sc             ON token_kiosk_assignments (branch_id, service_center_id) WHERE service_center_id IS NOT NULL;

-- token_locations
CREATE UNIQUE INDEX idx_tl_branch_code ON token_locations (branch_id, code);
CREATE INDEX idx_tl_branch_active      ON token_locations (branch_id, is_active, display_order);

-- token_counters
CREATE UNIQUE INDEX idx_tc_unique  ON token_counters (branch_id, reference_type, reference_id, counter_number);
CREATE INDEX idx_tc_reference      ON token_counters (reference_type, reference_id);

-- token_sequences
CREATE UNIQUE INDEX idx_ts_unique  ON token_sequences (branch_id, reference_type, reference_id, seq_date);

-- token_records (most heavily queried table)
CREATE INDEX idx_tr_branch_ref_date ON token_records (branch_id, reference_id, issued_at DESC);
CREATE INDEX idx_tr_status          ON token_records (status) WHERE status IN ('WAITING','CALLED','SERVING','ON_HOLD');
CREATE INDEX idx_tr_counter         ON token_records (counter_id, issued_at DESC);
CREATE INDEX idx_tr_kiosk           ON token_records (kiosk_id, issued_at DESC);
CREATE INDEX idx_tr_type            ON token_records (token_type, branch_id);

-- Partitioned index (if using table partitioning):
CREATE INDEX idx_tr_part_date ON token_records (issued_at) -- automatically per partition

-- token_calls
CREATE INDEX idx_tcall_record      ON token_calls (token_record_id);
CREATE INDEX idx_tcall_counter     ON token_calls (counter_id, performed_at DESC);
CREATE INDEX idx_tcall_date        ON token_calls (performed_at DESC);

-- token_analytics_daily
CREATE UNIQUE INDEX idx_tad_unique ON token_analytics_daily (branch_id, reference_type, reference_id, analytics_date);

-- token_audit_logs
CREATE INDEX idx_tal_entity ON token_audit_logs (entity_type, entity_id);
CREATE INDEX idx_tal_branch ON token_audit_logs (branch_id, changed_at DESC);
CREATE INDEX idx_tal_user   ON token_audit_logs (changed_by, changed_at DESC);

-- token_display_pages
CREATE UNIQUE INDEX idx_tdp_slug ON token_display_pages (slug);
CREATE INDEX idx_tdp_branch      ON token_display_pages (branch_id, is_active);
```

---

## 26. Folder Structure

```
backend/src/modules/token/
├── token.module.ts
│
├── config/                          # Branch config, mode, branding, prefix
│   ├── token-config.controller.ts
│   ├── token-config.service.ts
│   └── entities/
│       ├── token-branch-config.entity.ts
│       ├── token-sc-config.entity.ts
│       └── token-kiosk-branding.entity.ts
│
├── kiosk/                           # Kiosk registry and assignment
│   ├── kiosk.controller.ts
│   ├── kiosk.service.ts
│   ├── kiosk-slug.util.ts
│   └── entities/
│       ├── token-kiosk.entity.ts
│       └── token-kiosk-assignment.entity.ts
│
├── location/                        # Location Based mode locations
│   ├── location.controller.ts
│   ├── location.service.ts
│   └── entities/
│       └── token-location.entity.ts
│
├── counter/                         # Physical counters
│   ├── counter.controller.ts
│   ├── counter.service.ts
│   └── entities/
│       └── token-counter.entity.ts
│
├── queue/                           # Token lifecycle, sequences, operations
│   ├── queue.controller.ts
│   ├── queue.service.ts
│   ├── queue.gateway.ts             # Socket.io gateway (replaces token.gateway.ts)
│   ├── queue-sequence.service.ts    # Token number generation
│   └── entities/
│       ├── token-record.entity.ts
│       ├── token-call.entity.ts
│       └── token-sequence.entity.ts
│
├── display/                         # TV display page configs
│   ├── display.controller.ts
│   ├── display.service.ts
│   └── entities/
│       └── display-page.entity.ts
│
├── analytics/                       # Aggregated analytics
│   ├── analytics.controller.ts
│   ├── analytics.service.ts
│   ├── analytics.cron.ts            # Daily aggregation job
│   └── entities/
│       └── token-analytics-daily.entity.ts
│
├── his-bridge/                      # HIS Oracle pass-through
│   ├── his-bridge.controller.ts
│   ├── his-bridge.service.ts
│   └── his-bridge.queue.ts          # Bull queue for retry
│
└── audit/
    ├── audit.service.ts
    └── entities/
        └── token-audit-log.entity.ts


frontend/src/app/
├── (platform)/
│   └── token/
│       ├── page.tsx                 # Counter dashboard (adapts to mode)
│       ├── config/
│       │   ├── page.tsx             # Mode selection + overview
│       │   ├── service-centers/
│       │   │   └── page.tsx         # SC configuration table
│       │   ├── locations/
│       │   │   └── page.tsx         # Location management
│       │   ├── kiosks/
│       │   │   └── page.tsx         # Kiosk management + QR codes
│       │   ├── counters/
│       │   │   └── page.tsx         # Counter management
│       │   ├── displays/
│       │   │   └── page.tsx         # Display board management
│       │   ├── branding/
│       │   │   └── page.tsx         # Kiosk branding
│       │   └── prefix/
│       │       └── page.tsx         # Token prefix/numbering config
│       └── analytics/
│           └── page.tsx             # Analytics dashboard
│
├── kiosk/
│   └── [slug]/
│       └── page.tsx                 # Public kiosk (no auth)
│
└── display/
    └── [slug]/
        └── page.tsx                 # Public display board (no auth)


frontend/src/lib/
├── hooks/
│   ├── useTokenSocket.ts            # Authenticated operator WS hook
│   ├── useKioskSocket.ts            # Public kiosk WS hook
│   └── useDisplaySocket.ts          # Public display WS hook
├── api/
│   ├── token-config.api.ts
│   ├── kiosk.api.ts
│   └── queue.api.ts
└── store/
    └── token-config.store.ts        # Zustand store for branch mode
```

---

## 27. Backend Architecture

### 27.1 Module Structure

```typescript
// token.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TokenBranchConfig, TokenKiosk, TokenKioskAssignment,
      TokenScConfig, TokenLocation, TokenCounter,
      TokenRecord, TokenCall, TokenSequence,
      DisplayPage, TokenAnalyticsDaily, TokenAuditLog,
      TokenKioskBranding,
    ]),
    BullModule.registerQueue({ name: 'his-bridge' }),
    BullModule.registerQueue({ name: 'token-analytics' }),
  ],
  controllers: [
    TokenConfigController, KioskController,
    LocationController, CounterController,
    QueueController, DisplayController,
    AnalyticsController, HisBridgeController,
  ],
  providers: [
    TokenConfigService, KioskService, LocationService,
    CounterService, QueueService, QueueSequenceService,
    DisplayService, AnalyticsService, AnalyticsCron,
    HisBridgeService, HisBridgeProcessor,
    QueueGateway, AuditService,
  ],
})
export class TokenModule {}
```

### 27.2 Gateway Architecture

```typescript
// queue.gateway.ts
@WebSocketGateway({ namespace: 'queue', cors: { origin: '*' } })
export class QueueGateway {
  // Branch rooms: branch:{branchId}
  // Counter rooms: counter:{counterId}
  // Kiosk rooms: kiosk:{kioskSlug}
  // Display rooms: display:{slug}

  async broadcastTokenCalled(payload: TokenCalledPayload) {
    this.server
      .to(`branch:${payload.branchId}`)
      .emit('token:called', payload);
  }

  async broadcastQueueState(branchId: string, referenceId: string) {
    const state = await this.queueService.getQueueState(branchId, referenceId);
    this.server
      .to(`branch:${branchId}`)
      .emit('queue:state', state);
  }
}
```

### 27.3 Mode-Aware Service Pattern

```typescript
// queue.service.ts
async getQueueState(branchId: string, referenceId: string) {
  const mode = await this.configService.getBranchMode(branchId);

  if (mode === 'SERVICE_CENTER_BASED') {
    return this.getScQueueState(branchId, referenceId);
  } else {
    return this.getLocationQueueState(branchId, referenceId);
  }
}
```

---

## 28. Frontend Architecture

### 28.1 Counter Dashboard (Mode-Adaptive)

The counter dashboard reads `branchMode` from the token socket context and renders accordingly:

```typescript
// Counter dashboard adapts UI based on branch mode
const { branchMode } = useTokenConfig(); // 'SERVICE_CENTER_BASED' | 'LOCATION_BASED'

// Join panel shows:
// SC Based → Department dropdown → Service Center dropdown → Counter grid
// Location Based → Location dropdown → Counter grid

// Operator screen label shows:
// SC Based → "Registration Counter 2"
// Location Based → "Ground Floor Billing Counter 2"
```

### 28.2 Kiosk Page Architecture

```typescript
// /kiosk/[slug]/page.tsx
// 1. Fetch kiosk config (type + assignments + branding)
// 2. Render based on type:

const KioskPage = () => {
  const { slug } = useParams();
  const { kiosk, branding, assignments } = useKioskConfig(slug);

  if (kiosk.type === 'MULTIPLE') {
    return <DirectPrintKiosk assignment={assignments[0]} branding={branding} />;
  }

  if (kiosk.type === 'SINGLE') {
    return <SelectionKiosk assignments={assignments} branding={branding} />;
  }
};
```

### 28.3 Display Page Architecture

```typescript
// /display/[slug]/page.tsx
const DisplayPage = () => {
  const { slug } = useParams();
  const { assignments, config } = useDisplayConfig(slug);

  // Renders based on config.layout:
  // FULL, SPLIT_2, SPLIT_3, GRID_4, TICKER
  // Each assignment panel shows its own queue state
};
```

---

## 29. Multi-Tenant Architecture

### 29.1 Isolation Guarantees

Every entity has a `branch_id` column. Every service method receives `branchId` from the JWT `activeBranchId` claim and filters all queries with it.

```typescript
// Enforced at service layer — never trust branchId from request body
async getKiosks(branchId: string): Promise<TokenKiosk[]> {
  return this.kioskRepo.find({ where: { branchId, isArchived: false } });
}
```

### 29.2 WebSocket Isolation

All WebSocket rooms are prefixed with `branch:{branchId}`. Cross-branch events are impossible — a socket only joins its own branch room.

### 29.3 Kiosk URL Isolation

Kiosk slugs are globally unique (across all branches). The kiosk config endpoint returns branding and queue state only for the kiosk's own branch. A kiosk slug from Branch A cannot issue tokens for Branch B.

---

## 30. Future Extensibility

### 30.1 Mobile Token Issuance

```
Patient scans QR at entrance
       │
       ▼
Mobile browser opens /kiosk/{slug}?mobile=1
       │
       ▼
Same issue flow; token sent via SMS/WhatsApp
```

Design: kiosk endpoint already public; add optional `mobile` flag for different receipt format.

### 30.2 Online Appointment Integration

When HIS appointment is booked, pre-issue a token of type `APPOINTMENT`:
```
HIS webhook → POST /token/issue/appointment
  { branchId, serviceCenterId, appointmentId, appointmentTime }
  → Issues token with type=APPOINTMENT, priority=30
  → SMS/WhatsApp sent with token number + estimated time
```

### 30.3 Analytics Webhooks

Push daily summaries to external BI systems:
```
token_analytics_daily → webhook → Power BI / Grafana / HIS reporting
```

### 30.4 Multi-Language Kiosk

All kiosk UI strings stored in JSON:
```json
{ "en": "Print Token", "ar": "طباعة الرمز", "ml": "ടോക്കൺ അച്ചടിക്കുക" }
```

Language selection: URL param (`?lang=ar`) or kiosk branding config.

### 30.5 Counter Performance Scoring

Future module: automatically score operator performance (avg serve time, missed rate, volume) and surface in analytics.

---

## 31. Additional Scenarios

### 31.1 Service Center Belonging to Multiple Kiosks

**Supported by design.** `token_kiosk_assignments` is a join table. SC `Laboratory` can have assignments to both `KIOSK01` (Single) and `LAB_KIOSK` (Multiple). Both kiosks issue tokens from the same daily sequence for `Laboratory`.

### 31.2 Temporary Kiosk Outage Failover

- Admin disables kiosk `LAB_KIOSK`
- Merges `Laboratory` into `GENERAL_KIOSK` via admin panel (adds assignment row)
- Patients use `GENERAL_KIOSK` during outage
- When `LAB_KIOSK` comes back, remove the merged assignment
- `LAB_KIOSK` resumes; token sequence continues where it left off

### 31.3 QR Code Support

```
GET /token/kiosks/:slug/qr?format=svg&size=300
```

Returns SVG QR encoding `https://{domain}/kiosk/{slug}`.  
Admin can download, print, and laminate for physical placement near kiosk.

### 31.4 Branch-Specific Branding

`token_kiosk_branding` table stores per-branch logo, colors, welcome message. All public kiosk and display pages load branding via `GET /kiosk/:slug` response which includes `branding` object.

### 31.5 Multi-Language Kiosk UI

Language stored in `token_kiosk_branding.available_langs`. Patient selects language at kiosk opening (optional — default is branch default lang). All static strings in i18n JSON files; service center / location names shown as-is from DB.

### 31.6 Accessibility — Large Font Mode

`token_kiosk_branding.font_size_mode`:
- `NORMAL` — base 16px
- `LARGE` — base 20px  
- `EXTRA_LARGE` — base 26px + high-contrast mode

Applied via CSS class on `<html>` element on kiosk page load.

### 31.7 Printer Offline / Paper-Out Handling

```typescript
// Kiosk: check print result before confirming token
const handlePrint = async () => {
  const issued = await issueToken(); // increments sequence
  try {
    await triggerPrint(issued.tokenNumber); // returns print status
    // On success: show "Your token is R-047"
  } catch (printError) {
    // Printer failed AFTER token was issued
    // Show: "Token R-047 issued but printer failed. Show this number to reception."
    // Do NOT re-issue — token is already in the queue
    setIssuedTokenDisplay(issued.fullToken);
  }
};
```

### 31.8 Duplicate Kiosk URL Prevention

The `generateKioskSlug` function checks uniqueness before inserting. Database also has `UNIQUE` constraint on `kiosk_slug`. In the extreme case of collision (probability ≈ 1 in 2.8 trillion), the function retries up to 10 times before throwing.

### 31.9 Secure Kiosk URLs Against Tampering

- Kiosk slugs are opaque (no guessable pattern)
- The `/kiosk/:slug/issue` endpoint validates slug exists and is active before issuing
- Optional: add a `X-Kiosk-Token` header (HMAC of slug + date) for machine-level auth
- Kiosks can be IP-whitelisted at the Nginx layer for additional security

### 31.10 Archive vs Delete

- **Archive**: kiosk marked `is_archived=true`, URL returns 410 Gone, all historical records preserved
- **Disable**: kiosk marked `is_active=false`, URL shows maintenance screen, can be re-enabled
- **Delete**: never implemented — only archive to preserve audit history

### 31.11 Moving a Service Center Between Kiosks

1. Admin opens Kiosk A → Assignments → Remove "Pharmacy"
2. Admin opens Kiosk B → Add Assignment → Select "Pharmacy"
3. Audit log records both changes with before/after state
4. Token sequence for Pharmacy is unaffected — it continues from the same counter

### 31.12 Reporting & Analytics

**Real-time (WebSocket):**
- Current queue depth per service center / location
- Active counters and who is operating them
- Average wait time (rolling 30-min window from Redis)

**Historical (PostgreSQL):**
- `token_analytics_daily` pre-aggregated by cron job at midnight
- Exportable as CSV from admin UI
- Metrics: volume by hour, by type, by counter; wait time percentiles; missed/cancelled rates

**Indexes** on `token_records (branch_id, reference_id, issued_at)` ensure analytics queries are fast even with millions of records.

### 31.13 Token Generation During HIS Downtime (SC Based Mode)

```
HIS Oracle DOWN
       │
       ▼
Kiosk loads cached SC list (Redis, 4h TTL)
       │
       ▼
Patient selects SC, issues token
  → token_sequences incremented (local, no HIS needed)
  → token_records inserted (local)
  → HIS PRINT_DATA_DETAIL insert → FAILS
       │
       ▼
Bull queue: job added with payload
  retry: up to 48 hours, exponential backoff
       │
       ▼
HIS comes back online
  → Bull processes queued jobs
  → PRINT_DATA_DETAIL rows inserted in order
  → Reconciliation complete
```

### 31.14 QR Code for Mobile Token

```
/kiosk/{slug}?channel=mobile
→ Issue token
→ Instead of print: show token on screen + option to save as image
→ Optionally: SMS/WhatsApp integration via Twilio/MSG91
```

---

## Summary Reference Card

| Feature | Service Center Based | Location Based |
|---|---|---|
| Data source | HIS Oracle | PostgreSQL (manual) |
| Department selection | HIS | N/A |
| SC/Location selection | HIS | Admin-created |
| Kiosk types | Multiple, Single, Merge | Multiple, Single, Merge |
| Counter dashboard | Works with HIS SCs | Works with Locations |
| HIS downtime | Degraded (cache) | Unaffected |
| Branch isolation | Full | Full |
| Per-branch config | Yes | Yes |
| Daily reset | Configurable | Configurable |
| Token prefixes | Per SC | Per location |
| Analytics | Same | Same |
| Audit logs | Same | Same |

---

*Document prepared for HDSP engineering team. Last updated: June 2026.*
