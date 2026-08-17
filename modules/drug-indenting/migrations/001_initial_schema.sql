-- Migration 001: Drug Indenting initial schema
-- Source: pg_dump --schema-only of the live drug_indenting schema.
-- Creates the drug_indenting schema and all tables, sequences,
-- primary keys, foreign keys, and indexes in dependency order.

CREATE SCHEMA IF NOT EXISTS drug_indenting;

SET search_path TO drug_indenting, public;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    user_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                character varying(200) NOT NULL,
    email               character varying(200) NOT NULL UNIQUE,
    password            character varying(200) NOT NULL,
    role                character varying(50)  NOT NULL,
    department          character varying(200),
    is_active           boolean DEFAULT true   NOT NULL,
    is_approved         boolean DEFAULT true   NOT NULL,
    force_password_reset   boolean DEFAULT false,
    temp_password_issued   boolean DEFAULT false,
    user_login_id       character varying(50)  NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_login_id ON users (user_login_id);

CREATE TABLE IF NOT EXISTS admin_users (
    admin_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       character varying(200) NOT NULL,
    email      character varying(200) NOT NULL UNIQUE,
    password   character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS drug_requests (
    request_id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doctor_id                  bigint NOT NULL REFERENCES users(user_id),
    created_by_user_id         bigint REFERENCES users(user_id),
    created_by_role            character varying(50) DEFAULT 'Doctor',
    hod_id                     bigint REFERENCES users(user_id),
    med_rep_name               character varying(200),
    med_rep_email              character varying(200),
    med_rep_phone              character varying(50),
    request_type               character varying(100) NOT NULL,
    formulary_request_type     character varying(50),
    request_source_type        character varying(20) DEFAULT 'PROMOTIONAL',
    category                   character varying(100) NOT NULL,
    brand_name                 character varying(200) NOT NULL,
    generic_name               character varying(200) NOT NULL,
    dose_strength              character varying(100) NOT NULL,
    dosage_form                character varying(100) NOT NULL,
    manufacturer               character varying(200) NOT NULL,
    marketer                   character varying(200) NOT NULL,
    existing_brands            character varying(500),
    existing_generic_data      text,
    ai_content                 text,
    medicine_quantity          integer,
    clinical_justification     text NOT NULL,
    expected_patients_pm       integer,
    cost_reduction_benefit     boolean DEFAULT false,
    status                     character varying(50) DEFAULT 'Pending' NOT NULL,
    current_stage              character varying(50) DEFAULT 'PharmacyHead' NOT NULL,
    is_emergency               boolean DEFAULT false,
    is_reverted                boolean DEFAULT false,
    revert_count               integer DEFAULT 0,
    approved_by_hod            boolean DEFAULT false,
    hod_remarks                character varying(1000),
    hod_action_timestamp       timestamp without time zone,
    pharmacist_remarks         character varying(1000),
    pharmacist2_remarks        character varying(1000),
    ph_review_remarks          text,
    ph_remarks                 character varying(1000),
    ph_remarks2                character varying(1000),
    ph_review2_remarks         character varying(2000),
    ph_final_recommendation    text,
    dtc_remarks                character varying(1000),
    dtc_final_remarks          character varying(1000),
    dtc_selected_brand         character varying(500),
    dtc_selected_category      character varying(100),
    dtc_selection_reasons      text,
    dtc_recommendation_notes   text,
    dtc_reviewed_by            bigint,
    dtc_reviewed_at            timestamp without time zone,
    dtc_reviewed_by_name       character varying(500),
    dtc_review_signature       character varying(1000),
    dtc_final_selection_notes  character varying(1000),
    dtc_final_recommendations  text,
    ceo_remarks                character varying(1000),
    final_selected_alternative_id bigint,
    final_selected_brand       character varying(500),
    final_selected_category    character varying(100),
    final_selection_reasons    text,
    final_recommendation_notes text,
    revert_remarks             character varying(4000),
    reverted_by                bigint,
    reverted_at                timestamp without time zone,
    last_corrected_at          timestamp without time zone,
    last_corrected_by          bigint,
    inventory_added            boolean DEFAULT false,
    inventory_added_at         timestamp without time zone,
    inventory_added_by         bigint,
    inventory_item_name        character varying(500),
    inventory_received         boolean DEFAULT false,
    inventory_received_at      timestamp without time zone,
    inventory_received_by      bigint,
    created_at                 timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at                 timestamp without time zone,
    effective_created_at       timestamp without time zone
);
CREATE INDEX IF NOT EXISTS idx_dreq_stage          ON drug_requests (current_stage, status);
CREATE INDEX IF NOT EXISTS idx_dreq_doctor_created ON drug_requests (doctor_id, created_at);

CREATE TABLE IF NOT EXISTS drug_alternatives (
    alt_id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id              bigint NOT NULL REFERENCES drug_requests(request_id) ON DELETE CASCADE,
    brand_name              character varying(200) NOT NULL,
    manufacturer            character varying(200) NOT NULL,
    marketer                character varying(200),
    consultant              character varying(300),
    introduced_on           character varying(100),
    consultant_present_stock integer,
    purchase_quantity       integer,
    sale_quantity           integer,
    sale_qty                integer,
    pack                    character varying(100),
    mrp                     numeric(10,2),
    rate                    numeric(10,2),
    qty                     numeric(10,2),
    offer                   numeric(10,2),
    negotiated_rate         numeric(10,2),
    mrp_per_pack            numeric(10,2),
    rate_per_pack           numeric(10,2),
    gst_percent             numeric(5,2),
    markup_margin           numeric(10,2),
    scheme_qty              integer,
    scheme_offer            character varying(200),
    net_rate                numeric(10,2),
    total_margin            numeric(10,2),
    profit_margin           numeric(10,2),
    absolute_margin         numeric(10,2),
    stock                   character varying(100),
    existing_drug_details   character varying(500),
    transaction_history     character varying(500),
    margin_comparison       character varying(500),
    sales_data              character varying(500),
    stock_usage             character varying(500),
    comparison_type         character varying(20),
    is_final_selected       boolean DEFAULT false,
    remark                  character varying(500),
    refer                   character varying(500),
    submitted_by            bigint REFERENCES users(user_id),
    created_at              timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dalt_request ON drug_alternatives (request_id);

CREATE TABLE IF NOT EXISTS drug_alternative_negotiations (
    negotiation_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alternative_id             bigint NOT NULL REFERENCES drug_alternatives(alt_id) ON DELETE CASCADE,
    negotiated_mrp             numeric(10,2),
    negotiated_rate            numeric(10,2),
    negotiated_gst             numeric(5,2),
    negotiated_scheme_qty      integer,
    negotiated_scheme_offer    character varying(200),
    negotiated_net_rate        numeric(10,2),
    negotiated_profit_margin   numeric(10,2),
    negotiated_absolute_margin numeric(10,2),
    negotiated_total_margin    numeric(10,2),
    negotiated_by              bigint REFERENCES users(user_id),
    negotiated_at              timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    negotiation_remarks        character varying(1000)
);

CREATE TABLE IF NOT EXISTS drug_effective_entries (
    entry_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id           bigint NOT NULL REFERENCES drug_requests(request_id) ON DELETE CASCADE,
    drug_name            character varying(500),
    effective_created_at timestamp without time zone,
    remarks              character varying(2000),
    created_by           bigint REFERENCES users(user_id),
    created_at           timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entry_data           text
);
CREATE INDEX IF NOT EXISTS idx_deffe_request ON drug_effective_entries (request_id);

CREATE TABLE IF NOT EXISTS drug_existing_details (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id     bigint NOT NULL REFERENCES drug_requests(request_id) ON DELETE CASCADE,
    row_no         integer NOT NULL,
    introduced_on  character varying(100),
    brand_name     character varying(200),
    manufacturer   character varying(200),
    marketer       character varying(200),
    consultant     character varying(300),
    present_stock  integer,
    purchase_qty   integer,
    sale_qty       integer,
    pack           character varying(100),
    mrp_inc_gst_nos  numeric(10,4),
    rate_inc_gst_nos numeric(10,4),
    markup_margin    numeric(10,2),
    scheme_qty       integer,
    scheme_offer     character varying(200),
    net_rate         numeric(10,4),
    profit_margin    numeric(10,2),
    absolute_margin  numeric(10,4),
    total_margin     numeric(10,2),
    remark           character varying(1000),
    created_at       timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at       timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dexist_request ON drug_existing_details (request_id);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users(user_id),
    request_id      bigint REFERENCES drug_requests(request_id),
    message         character varying(1000) NOT NULL,
    is_read         boolean DEFAULT false   NOT NULL,
    created_at      timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, is_read);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id  bigint NOT NULL REFERENCES drug_requests(request_id),
    action      character varying(50) NOT NULL,
    performed_by bigint NOT NULL REFERENCES users(user_id),
    from_stage  character varying(50),
    to_stage    character varying(50),
    remarks     character varying(1000),
    logged_at   timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_logs (request_id);

CREATE TABLE IF NOT EXISTS approval_remark_history (
    history_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_name   character varying(100),
    remark_text character varying(4000) NOT NULL,
    created_by  bigint,
    usage_count integer DEFAULT 1,
    last_used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active   boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_approval_history_text ON approval_remark_history (remark_text);

CREATE TABLE IF NOT EXISTS rejection_remark_history (
    history_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remark_text character varying(4000) NOT NULL,
    created_by  bigint,
    usage_count integer DEFAULT 1,
    last_used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active   boolean DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_rejection_history_text ON rejection_remark_history (remark_text);

CREATE TABLE IF NOT EXISTS blacklisted_companies (
    blacklist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_name character varying(300) NOT NULL,
    company_type character varying(50)  NOT NULL,
    remarks      character varying(2000),
    created_by   bigint,
    is_active    boolean DEFAULT true,
    created_at   timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    removed_by   bigint,
    removed_at   timestamp without time zone
);

CREATE TABLE IF NOT EXISTS user_request_quotas (
    quota_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        bigint NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    quarterly_limit integer DEFAULT 10 NOT NULL,
    updated_by     bigint REFERENCES users(user_id),
    updated_at     timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_drafts (
    draft_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id    bigint NOT NULL REFERENCES drug_requests(request_id) ON DELETE CASCADE,
    pharmacist_id bigint NOT NULL REFERENCES users(user_id),
    draft_name    character varying(300),
    draft_data    text,
    status        character varying(20) DEFAULT 'DRAFT',
    created_at    timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id    bigint NOT NULL REFERENCES admin_users(admin_id),
    action      character varying(100) NOT NULL,
    target_user bigint,
    details     character varying(2000),
    performed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
