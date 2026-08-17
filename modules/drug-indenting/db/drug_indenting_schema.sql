--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drug_indenting; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS drug_indenting;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.admin_audit_logs (
    audit_id bigint NOT NULL,
    admin_id bigint NOT NULL,
    action character varying(100) NOT NULL,
    target_user bigint,
    details character varying(2000),
    performed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_audit_logs_audit_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.admin_audit_logs ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.admin_audit_logs_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_users; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.admin_users (
    admin_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(200) NOT NULL,
    password character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_users_admin_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.admin_users ALTER COLUMN admin_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.admin_users_admin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: analysis_drafts; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.analysis_drafts (
    draft_id bigint NOT NULL,
    request_id bigint NOT NULL,
    pharmacist_id bigint NOT NULL,
    draft_name character varying(300),
    draft_data text,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: analysis_drafts_draft_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.analysis_drafts ALTER COLUMN draft_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.analysis_drafts_draft_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: approval_remark_history; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.approval_remark_history (
    history_id bigint NOT NULL,
    role_name character varying(100),
    remark_text character varying(4000) NOT NULL,
    created_by bigint,
    usage_count integer DEFAULT 1,
    last_used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


--
-- Name: approval_remark_history_history_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.approval_remark_history ALTER COLUMN history_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.approval_remark_history_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_logs; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.audit_logs (
    log_id bigint NOT NULL,
    request_id bigint NOT NULL,
    action character varying(50) NOT NULL,
    performed_by bigint NOT NULL,
    from_stage character varying(50),
    to_stage character varying(50),
    remarks character varying(1000),
    logged_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_logs_log_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.audit_logs ALTER COLUMN log_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.audit_logs_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: blacklisted_companies; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.blacklisted_companies (
    blacklist_id bigint NOT NULL,
    company_name character varying(300) NOT NULL,
    company_type character varying(50) NOT NULL,
    remarks character varying(2000),
    created_by bigint,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    removed_by bigint,
    removed_at timestamp without time zone
);


--
-- Name: blacklisted_companies_blacklist_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.blacklisted_companies ALTER COLUMN blacklist_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.blacklisted_companies_blacklist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: drug_alternative_negotiations; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.drug_alternative_negotiations (
    negotiation_id bigint NOT NULL,
    alternative_id bigint NOT NULL,
    negotiated_mrp numeric(10,2),
    negotiated_rate numeric(10,2),
    negotiated_gst numeric(5,2),
    negotiated_scheme_qty integer,
    negotiated_scheme_offer character varying(200),
    negotiated_net_rate numeric(10,2),
    negotiated_profit_margin numeric(10,2),
    negotiated_absolute_margin numeric(10,2),
    negotiated_total_margin numeric(10,2),
    negotiated_by bigint,
    negotiated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    negotiation_remarks character varying(1000)
);


--
-- Name: drug_alternative_negotiations_negotiation_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.drug_alternative_negotiations ALTER COLUMN negotiation_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.drug_alternative_negotiations_negotiation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: drug_alternatives; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.drug_alternatives (
    alt_id bigint NOT NULL,
    request_id bigint NOT NULL,
    brand_name character varying(200) NOT NULL,
    manufacturer character varying(200) NOT NULL,
    marketer character varying(200),
    consultant character varying(300),
    introduced_on character varying(100),
    consultant_present_stock integer,
    purchase_quantity integer,
    sale_quantity integer,
    sale_qty integer,
    pack character varying(100),
    mrp numeric(10,2),
    rate numeric(10,2),
    qty numeric(10,2),
    offer numeric(10,2),
    negotiated_rate numeric(10,2),
    mrp_per_pack numeric(10,2),
    rate_per_pack numeric(10,2),
    gst_percent numeric(5,2),
    markup_margin numeric(10,2),
    scheme_qty integer,
    scheme_offer character varying(200),
    net_rate numeric(10,2),
    total_margin numeric(10,2),
    profit_margin numeric(10,2),
    absolute_margin numeric(10,2),
    stock character varying(100),
    existing_drug_details character varying(500),
    transaction_history character varying(500),
    margin_comparison character varying(500),
    sales_data character varying(500),
    stock_usage character varying(500),
    comparison_type character varying(20),
    is_final_selected boolean DEFAULT false,
    remark character varying(500),
    refer character varying(500),
    submitted_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: drug_alternatives_alt_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.drug_alternatives ALTER COLUMN alt_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.drug_alternatives_alt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: drug_effective_entries; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.drug_effective_entries (
    entry_id bigint NOT NULL,
    request_id bigint NOT NULL,
    drug_name character varying(500),
    effective_created_at timestamp without time zone,
    remarks character varying(2000),
    created_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entry_data text
);


--
-- Name: drug_effective_entries_entry_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.drug_effective_entries ALTER COLUMN entry_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.drug_effective_entries_entry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: drug_existing_details; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.drug_existing_details (
    id bigint NOT NULL,
    request_id bigint NOT NULL,
    row_no integer NOT NULL,
    introduced_on character varying(100),
    brand_name character varying(200),
    manufacturer character varying(200),
    marketer character varying(200),
    consultant character varying(300),
    present_stock integer,
    purchase_qty integer,
    sale_qty integer,
    pack character varying(100),
    mrp_inc_gst_nos numeric(10,4),
    rate_inc_gst_nos numeric(10,4),
    markup_margin numeric(10,2),
    scheme_qty integer,
    scheme_offer character varying(200),
    net_rate numeric(10,4),
    profit_margin numeric(10,2),
    absolute_margin numeric(10,4),
    total_margin numeric(10,2),
    remark character varying(1000),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: drug_existing_details_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.drug_existing_details ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.drug_existing_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: drug_requests; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.drug_requests (
    request_id bigint NOT NULL,
    doctor_id bigint NOT NULL,
    created_by_user_id bigint,
    created_by_role character varying(50) DEFAULT 'Doctor'::character varying,
    hod_id bigint,
    med_rep_name character varying(200),
    med_rep_email character varying(200),
    med_rep_phone character varying(50),
    request_type character varying(100) NOT NULL,
    formulary_request_type character varying(50),
    request_source_type character varying(20) DEFAULT 'PROMOTIONAL'::character varying,
    category character varying(100) NOT NULL,
    brand_name character varying(200) NOT NULL,
    generic_name character varying(200) NOT NULL,
    dose_strength character varying(100) NOT NULL,
    dosage_form character varying(100) NOT NULL,
    manufacturer character varying(200) NOT NULL,
    marketer character varying(200) NOT NULL,
    existing_brands character varying(500),
    existing_generic_data text,
    ai_content text,
    medicine_quantity integer,
    clinical_justification text NOT NULL,
    expected_patients_pm integer,
    cost_reduction_benefit boolean DEFAULT false,
    status character varying(50) DEFAULT 'Pending'::character varying NOT NULL,
    current_stage character varying(50) DEFAULT 'PharmacyHead'::character varying NOT NULL,
    is_emergency boolean DEFAULT false,
    is_reverted boolean DEFAULT false,
    revert_count integer DEFAULT 0,
    approved_by_hod boolean DEFAULT false,
    hod_remarks character varying(1000),
    hod_action_timestamp timestamp without time zone,
    pharmacist_remarks character varying(1000),
    pharmacist2_remarks character varying(1000),
    ph_review_remarks text,
    ph_remarks character varying(1000),
    ph_remarks2 character varying(1000),
    ph_review2_remarks character varying(2000),
    ph_final_recommendation text,
    dtc_remarks character varying(1000),
    dtc_final_remarks character varying(1000),
    dtc_selected_brand character varying(500),
    dtc_selected_category character varying(100),
    dtc_selection_reasons text,
    dtc_recommendation_notes text,
    dtc_reviewed_by bigint,
    dtc_reviewed_at timestamp without time zone,
    dtc_reviewed_by_name character varying(500),
    dtc_review_signature character varying(1000),
    dtc_final_selection_notes character varying(1000),
    dtc_final_recommendations text,
    ceo_remarks character varying(1000),
    final_selected_alternative_id bigint,
    final_selected_brand character varying(500),
    final_selected_category character varying(100),
    final_selection_reasons text,
    final_recommendation_notes text,
    revert_remarks character varying(4000),
    reverted_by bigint,
    reverted_at timestamp without time zone,
    last_corrected_at timestamp without time zone,
    last_corrected_by bigint,
    inventory_added boolean DEFAULT false,
    inventory_added_at timestamp without time zone,
    inventory_added_by bigint,
    inventory_item_name character varying(500),
    inventory_received boolean DEFAULT false,
    inventory_received_at timestamp without time zone,
    inventory_received_by bigint,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone,
    effective_created_at timestamp without time zone
);


--
-- Name: drug_requests_request_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.drug_requests ALTER COLUMN request_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.drug_requests_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.notifications (
    notification_id bigint NOT NULL,
    user_id bigint NOT NULL,
    request_id bigint,
    message character varying(1000) NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.notifications ALTER COLUMN notification_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.notifications_notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rejection_remark_history; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.rejection_remark_history (
    history_id bigint NOT NULL,
    remark_text character varying(4000) NOT NULL,
    created_by bigint,
    usage_count integer DEFAULT 1,
    last_used_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true
);


--
-- Name: rejection_remark_history_history_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.rejection_remark_history ALTER COLUMN history_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.rejection_remark_history_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_request_quotas; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.user_request_quotas (
    quota_id bigint NOT NULL,
    user_id bigint NOT NULL,
    quarterly_limit integer DEFAULT 10 NOT NULL,
    updated_by bigint,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user_request_quotas_quota_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.user_request_quotas ALTER COLUMN quota_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.user_request_quotas_quota_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: drug_indenting; Owner: -
--

CREATE TABLE drug_indenting.users (
    user_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(200) NOT NULL,
    password character varying(200) NOT NULL,
    role character varying(50) NOT NULL,
    department character varying(200),
    is_active boolean DEFAULT true NOT NULL,
    is_approved boolean DEFAULT true NOT NULL,
    force_password_reset boolean DEFAULT false,
    temp_password_issued boolean DEFAULT false,
    user_login_id character varying(50) NOT NULL
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: drug_indenting; Owner: -
--

ALTER TABLE drug_indenting.users ALTER COLUMN user_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME drug_indenting.users_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (audit_id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (admin_id);


--
-- Name: analysis_drafts analysis_drafts_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.analysis_drafts
    ADD CONSTRAINT analysis_drafts_pkey PRIMARY KEY (draft_id);


--
-- Name: approval_remark_history approval_remark_history_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.approval_remark_history
    ADD CONSTRAINT approval_remark_history_pkey PRIMARY KEY (history_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id);


--
-- Name: blacklisted_companies blacklisted_companies_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.blacklisted_companies
    ADD CONSTRAINT blacklisted_companies_pkey PRIMARY KEY (blacklist_id);


--
-- Name: drug_alternative_negotiations drug_alternative_negotiations_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternative_negotiations
    ADD CONSTRAINT drug_alternative_negotiations_pkey PRIMARY KEY (negotiation_id);


--
-- Name: drug_alternatives drug_alternatives_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternatives
    ADD CONSTRAINT drug_alternatives_pkey PRIMARY KEY (alt_id);


--
-- Name: drug_effective_entries drug_effective_entries_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_effective_entries
    ADD CONSTRAINT drug_effective_entries_pkey PRIMARY KEY (entry_id);


--
-- Name: drug_existing_details drug_existing_details_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_existing_details
    ADD CONSTRAINT drug_existing_details_pkey PRIMARY KEY (id);


--
-- Name: drug_requests drug_requests_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_requests
    ADD CONSTRAINT drug_requests_pkey PRIMARY KEY (request_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: rejection_remark_history rejection_remark_history_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.rejection_remark_history
    ADD CONSTRAINT rejection_remark_history_pkey PRIMARY KEY (history_id);


--
-- Name: user_request_quotas user_request_quotas_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.user_request_quotas
    ADD CONSTRAINT user_request_quotas_pkey PRIMARY KEY (quota_id);


--
-- Name: user_request_quotas user_request_quotas_user_id_key; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.user_request_quotas
    ADD CONSTRAINT user_request_quotas_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: idx_approval_history_text; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_approval_history_text ON drug_indenting.approval_remark_history USING btree (remark_text);


--
-- Name: idx_audit_request; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_audit_request ON drug_indenting.audit_logs USING btree (request_id);


--
-- Name: idx_dalt_request; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_dalt_request ON drug_indenting.drug_alternatives USING btree (request_id);


--
-- Name: idx_deffe_request; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_deffe_request ON drug_indenting.drug_effective_entries USING btree (request_id);


--
-- Name: idx_dexist_request; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_dexist_request ON drug_indenting.drug_existing_details USING btree (request_id);


--
-- Name: idx_dreq_doctor_created; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_dreq_doctor_created ON drug_indenting.drug_requests USING btree (doctor_id, created_at);


--
-- Name: idx_dreq_stage; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_dreq_stage ON drug_indenting.drug_requests USING btree (current_stage, status);


--
-- Name: idx_notif_user; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_notif_user ON drug_indenting.notifications USING btree (user_id, is_read);


--
-- Name: idx_rejection_history_text; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE INDEX idx_rejection_history_text ON drug_indenting.rejection_remark_history USING btree (remark_text);


--
-- Name: uk_users_login_id; Type: INDEX; Schema: drug_indenting; Owner: -
--

CREATE UNIQUE INDEX uk_users_login_id ON drug_indenting.users USING btree (user_login_id);


--
-- Name: admin_audit_logs admin_audit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES drug_indenting.admin_users(admin_id);


--
-- Name: analysis_drafts analysis_drafts_pharmacist_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.analysis_drafts
    ADD CONSTRAINT analysis_drafts_pharmacist_id_fkey FOREIGN KEY (pharmacist_id) REFERENCES drug_indenting.users(user_id);


--
-- Name: analysis_drafts analysis_drafts_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.analysis_drafts
    ADD CONSTRAINT analysis_drafts_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.audit_logs
    ADD CONSTRAINT audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES drug_indenting.users(user_id);


--
-- Name: audit_logs audit_logs_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.audit_logs
    ADD CONSTRAINT audit_logs_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id);


--
-- Name: drug_alternative_negotiations drug_alternative_negotiations_alternative_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternative_negotiations
    ADD CONSTRAINT drug_alternative_negotiations_alternative_id_fkey FOREIGN KEY (alternative_id) REFERENCES drug_indenting.drug_alternatives(alt_id) ON DELETE CASCADE;


--
-- Name: drug_alternative_negotiations drug_alternative_negotiations_negotiated_by_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternative_negotiations
    ADD CONSTRAINT drug_alternative_negotiations_negotiated_by_fkey FOREIGN KEY (negotiated_by) REFERENCES drug_indenting.users(user_id);


--
-- Name: drug_alternatives drug_alternatives_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternatives
    ADD CONSTRAINT drug_alternatives_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id) ON DELETE CASCADE;


--
-- Name: drug_alternatives drug_alternatives_submitted_by_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_alternatives
    ADD CONSTRAINT drug_alternatives_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES drug_indenting.users(user_id);


--
-- Name: drug_effective_entries drug_effective_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_effective_entries
    ADD CONSTRAINT drug_effective_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES drug_indenting.users(user_id);


--
-- Name: drug_effective_entries drug_effective_entries_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_effective_entries
    ADD CONSTRAINT drug_effective_entries_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id) ON DELETE CASCADE;


--
-- Name: drug_existing_details drug_existing_details_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_existing_details
    ADD CONSTRAINT drug_existing_details_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id) ON DELETE CASCADE;


--
-- Name: drug_requests drug_requests_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_requests
    ADD CONSTRAINT drug_requests_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES drug_indenting.users(user_id);


--
-- Name: drug_requests drug_requests_doctor_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_requests
    ADD CONSTRAINT drug_requests_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES drug_indenting.users(user_id);


--
-- Name: drug_requests drug_requests_hod_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.drug_requests
    ADD CONSTRAINT drug_requests_hod_id_fkey FOREIGN KEY (hod_id) REFERENCES drug_indenting.users(user_id);


--
-- Name: notifications notifications_request_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.notifications
    ADD CONSTRAINT notifications_request_id_fkey FOREIGN KEY (request_id) REFERENCES drug_indenting.drug_requests(request_id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES drug_indenting.users(user_id);


--
-- Name: user_request_quotas user_request_quotas_updated_by_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.user_request_quotas
    ADD CONSTRAINT user_request_quotas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES drug_indenting.users(user_id);


--
-- Name: user_request_quotas user_request_quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: drug_indenting; Owner: -
--

ALTER TABLE ONLY drug_indenting.user_request_quotas
    ADD CONSTRAINT user_request_quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES drug_indenting.users(user_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

