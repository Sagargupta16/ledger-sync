-- REFERENCE ONLY: generated offline from working-tree SQLAlchemy metadata on 2026-09-18
-- Base checkout: 0467bc2c18789877b6d65147f9d9e77a4b852e71; includes uncommitted changes.
-- Source migration head: domain_storage_cutover_2026
-- Not a Neon dump, not a migration, and not a production restore script.
-- Includes 34 model tables and 463 columns. Excludes Alembic and the reported manual archive.
-- Models do not capture every server default/name retained by historical migrations.
-- Unqualified object names use the database search_path; public is the application convention.

CREATE TYPE transactiontype AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

CREATE TYPE accounttype AS ENUM ('CASH', 'BANK_ACCOUNTS', 'CREDIT_CARDS', 'INVESTMENTS', 'LOANS', 'OTHER_WALLETS');

CREATE TYPE recurrencefrequency AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY');

CREATE TYPE anomalytype AS ENUM ('HIGH_EXPENSE', 'UNUSUAL_CATEGORY', 'LARGE_TRANSFER', 'DUPLICATE_SUSPECTED', 'MISSING_RECURRING', 'BUDGET_EXCEEDED', 'CLOSED_ACCOUNT_ACTIVITY');

CREATE TYPE goalstatus AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');

CREATE TABLE column_mapping_logs (
	id SERIAL NOT NULL,
	file_name VARCHAR(500) NOT NULL,
	file_hash VARCHAR(64) NOT NULL,
	original_columns TEXT NOT NULL,
	mapped_columns TEXT NOT NULL,
	unmapped_columns TEXT,
	is_valid BOOLEAN NOT NULL,
	validation_errors TEXT,
	validation_warnings TEXT,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE users (
	id SERIAL NOT NULL,
	email VARCHAR(255) NOT NULL,
	hashed_password VARCHAR(255) NOT NULL,
	full_name VARCHAR(255),
	is_active BOOLEAN NOT NULL,
	is_verified BOOLEAN NOT NULL,
	auth_provider VARCHAR(20),
	auth_provider_id VARCHAR(255),
	token_version INTEGER DEFAULT '0' NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	last_login TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_users_auth_provider_identity UNIQUE (auth_provider, auth_provider_id)
);

CREATE TABLE user_ai_settings (
	user_id INTEGER NOT NULL,
	ai_mode VARCHAR(16) DEFAULT 'app_bedrock' NOT NULL,
	ai_provider VARCHAR(20),
	ai_model VARCHAR(100),
	ai_api_key_encrypted TEXT,
	ai_daily_token_limit INTEGER,
	ai_monthly_token_limit INTEGER,
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE ai_usage_log (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	provider VARCHAR(20) NOT NULL,
	model VARCHAR(100) NOT NULL,
	funding_source VARCHAR(16) DEFAULT 'legacy' NOT NULL,
	status VARCHAR(16) DEFAULT 'completed' NOT NULL,
	reserved_tokens INTEGER DEFAULT '0' NOT NULL,
	input_tokens INTEGER NOT NULL,
	output_tokens INTEGER NOT NULL,
	tool_rounds INTEGER NOT NULL,
	cost_usd FLOAT NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_ai_usage_funding_source CHECK (funding_source IN ('app', 'personal', 'legacy')),
	CONSTRAINT ck_ai_usage_status CHECK (status IN ('reserved', 'completed', 'failed')),
	CONSTRAINT ck_ai_usage_reserved_tokens CHECK (reserved_tokens >= 0),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE daily_summaries (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	date VARCHAR(10) NOT NULL,
	total_income NUMERIC(15, 2) NOT NULL,
	total_expenses NUMERIC(15, 2) NOT NULL,
	net NUMERIC(15, 2) NOT NULL,
	income_count INTEGER NOT NULL,
	expense_count INTEGER NOT NULL,
	transfer_count INTEGER NOT NULL,
	total_transactions INTEGER NOT NULL,
	top_category VARCHAR(255),
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE monthly_summaries (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	year INTEGER NOT NULL,
	month INTEGER NOT NULL,
	period_key VARCHAR(7) NOT NULL,
	total_income NUMERIC(15, 2) NOT NULL,
	salary_income NUMERIC(15, 2) NOT NULL,
	investment_income NUMERIC(15, 2) NOT NULL,
	other_income NUMERIC(15, 2) NOT NULL,
	total_expenses NUMERIC(15, 2) NOT NULL,
	essential_expenses NUMERIC(15, 2) NOT NULL,
	discretionary_expenses NUMERIC(15, 2) NOT NULL,
	capital_losses NUMERIC(15, 2) DEFAULT '0' NOT NULL,
	total_transfers_out NUMERIC(15, 2) NOT NULL,
	total_transfers_in NUMERIC(15, 2) NOT NULL,
	net_investment_flow NUMERIC(15, 2) NOT NULL,
	net_savings NUMERIC(15, 2) NOT NULL,
	savings_rate FLOAT NOT NULL,
	expense_ratio FLOAT NOT NULL,
	income_count INTEGER NOT NULL,
	expense_count INTEGER NOT NULL,
	transfer_count INTEGER NOT NULL,
	total_transactions INTEGER NOT NULL,
	income_change_pct FLOAT NOT NULL,
	expense_change_pct FLOAT NOT NULL,
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE category_trends (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	period_key VARCHAR(7) NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	transaction_type transactiontype NOT NULL,
	total_amount NUMERIC(15, 2) NOT NULL,
	transaction_count INTEGER NOT NULL,
	avg_transaction NUMERIC(15, 2) NOT NULL,
	max_transaction NUMERIC(15, 2) NOT NULL,
	min_transaction NUMERIC(15, 2) NOT NULL,
	pct_of_monthly_total FLOAT NOT NULL,
	mom_change NUMERIC(15, 2) NOT NULL,
	mom_change_pct FLOAT NOT NULL,
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE transfer_flows (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	from_account VARCHAR(255) NOT NULL,
	to_account VARCHAR(255) NOT NULL,
	total_amount NUMERIC(15, 2) NOT NULL,
	transaction_count INTEGER NOT NULL,
	avg_transfer NUMERIC(15, 2) NOT NULL,
	last_transfer_date TIMESTAMP WITHOUT TIME ZONE,
	last_transfer_amount NUMERIC(15, 2),
	from_account_type VARCHAR(50),
	to_account_type VARCHAR(50),
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE merchant_intelligence (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	merchant_name VARCHAR(255) NOT NULL,
	merchant_aliases TEXT,
	label_kind VARCHAR(16) NOT NULL,
	primary_category VARCHAR(255) NOT NULL,
	primary_subcategory VARCHAR(255),
	total_spent NUMERIC(15, 2) NOT NULL,
	transaction_count INTEGER NOT NULL,
	avg_transaction NUMERIC(15, 2) NOT NULL,
	first_transaction TIMESTAMP WITHOUT TIME ZONE,
	last_transaction TIMESTAMP WITHOUT TIME ZONE,
	months_active INTEGER NOT NULL,
	avg_days_between FLOAT NOT NULL,
	is_recurring BOOLEAN NOT NULL,
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE fy_summaries (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	fiscal_year VARCHAR(15) NOT NULL,
	start_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	end_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	total_income NUMERIC(15, 2) NOT NULL,
	salary_income NUMERIC(15, 2) NOT NULL,
	bonus_income NUMERIC(15, 2) NOT NULL,
	investment_income NUMERIC(15, 2) NOT NULL,
	other_income NUMERIC(15, 2) NOT NULL,
	total_expenses NUMERIC(15, 2) NOT NULL,
	tax_paid NUMERIC(15, 2) NOT NULL,
	investments_made NUMERIC(15, 2) NOT NULL,
	capital_losses NUMERIC(15, 2) DEFAULT '0' NOT NULL,
	net_savings NUMERIC(15, 2) NOT NULL,
	savings_rate FLOAT NOT NULL,
	yoy_income_change FLOAT NOT NULL,
	yoy_expense_change FLOAT NOT NULL,
	yoy_savings_change FLOAT NOT NULL,
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	is_complete BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE cohort_spending (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	dimension VARCHAR(20) NOT NULL,
	bucket INTEGER NOT NULL,
	total_amount NUMERIC(15, 2) NOT NULL,
	occurrences INTEGER NOT NULL,
	avg_amount NUMERIC(15, 2) NOT NULL,
	last_calculated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE analytics_state (
	user_id INTEGER NOT NULL,
	ledger_version BIGINT DEFAULT '0' NOT NULL,
	preferences_version BIGINT DEFAULT '0' NOT NULL,
	algorithm_version INTEGER DEFAULT '1' NOT NULL,
	published_ledger_version BIGINT DEFAULT '-1' NOT NULL,
	published_preferences_version BIGINT DEFAULT '-1' NOT NULL,
	published_algorithm_version INTEGER DEFAULT '0' NOT NULL,
	full_rebuild_required BOOLEAN DEFAULT true NOT NULL,
	dirty_dates TEXT DEFAULT '[]' NOT NULL,
	published_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE salary_plans (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	fiscal_year TEXT NOT NULL,
	position INTEGER NOT NULL,
	base_salary_annual NUMERIC NOT NULL,
	hra_annual NUMERIC,
	bonus_annual NUMERIC NOT NULL,
	epf_monthly NUMERIC NOT NULL,
	nps_monthly NUMERIC NOT NULL,
	special_allowance_annual NUMERIC NOT NULL,
	other_taxable_annual NUMERIC NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_salary_plans_user_fiscal_year UNIQUE (user_id, fiscal_year),
	CONSTRAINT ck_salary_plans_position CHECK (position >= 0),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE rsu_grants (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	public_id TEXT NOT NULL,
	position INTEGER NOT NULL,
	stock_name TEXT NOT NULL,
	stock_price NUMERIC NOT NULL,
	grant_date DATE,
	notes TEXT,
	PRIMARY KEY (id),
	CONSTRAINT uq_rsu_grants_user_public_id UNIQUE (user_id, public_id),
	CONSTRAINT uq_rsu_grants_user_id UNIQUE (user_id, id),
	CONSTRAINT ck_rsu_grants_position CHECK (position >= 0),
	CONSTRAINT ck_rsu_grants_stock_price CHECK (stock_price > 0 AND stock_price < CAST('Infinity' AS NUMERIC)),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tax_records (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	financial_year VARCHAR(10) NOT NULL,
	gross_salary NUMERIC(15, 2),
	bonus NUMERIC(15, 2),
	stipend NUMERIC(15, 2),
	rsu NUMERIC(15, 2),
	other_income NUMERIC(15, 2),
	total_gross_income NUMERIC(15, 2) NOT NULL,
	tds_deducted NUMERIC(15, 2),
	advance_tax NUMERIC(15, 2),
	self_assessment_tax NUMERIC(15, 2),
	total_tax_paid NUMERIC(15, 2) NOT NULL,
	standard_deduction NUMERIC(15, 2),
	section_80c NUMERIC(15, 2),
	section_80d NUMERIC(15, 2),
	other_deductions NUMERIC(15, 2),
	total_deductions NUMERIC(15, 2),
	taxable_income NUMERIC(15, 2) NOT NULL,
	source_file VARCHAR(500) NOT NULL,
	uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	notes TEXT,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT '2026-01-01' NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE net_worth_snapshots (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	snapshot_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	cash_and_bank NUMERIC(15, 2) NOT NULL,
	investments NUMERIC(15, 2) NOT NULL,
	mutual_funds NUMERIC(15, 2) NOT NULL,
	stocks NUMERIC(15, 2) NOT NULL,
	fixed_deposits NUMERIC(15, 2) NOT NULL,
	ppf_epf NUMERIC(15, 2) NOT NULL,
	other_assets NUMERIC(15, 2) NOT NULL,
	credit_card_outstanding NUMERIC(15, 2) NOT NULL,
	loans_payable NUMERIC(15, 2) NOT NULL,
	other_liabilities NUMERIC(15, 2) NOT NULL,
	total_assets NUMERIC(15, 2) NOT NULL,
	total_liabilities NUMERIC(15, 2) NOT NULL,
	net_worth NUMERIC(15, 2) NOT NULL,
	net_worth_change NUMERIC(15, 2) NOT NULL,
	net_worth_change_pct FLOAT NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	source VARCHAR(50) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_net_worth_user_date UNIQUE (user_id, snapshot_date),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE investment_holdings (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	account VARCHAR(255) NOT NULL,
	investment_type VARCHAR(100) NOT NULL,
	instrument_name VARCHAR(255),
	invested_amount NUMERIC(15, 2) NOT NULL,
	current_value NUMERIC(15, 2) NOT NULL,
	realized_gains NUMERIC(15, 2) NOT NULL,
	unrealized_gains NUMERIC(15, 2) NOT NULL,
	last_updated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	is_active BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE ledger_accounts (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	key VARCHAR(765) NOT NULL,
	name VARCHAR(255) NOT NULL,
	account_type accounttype,
	is_closed BOOLEAN DEFAULT false NOT NULL,
	closed_date TIMESTAMP WITHOUT TIME ZONE,
	credit_limit NUMERIC(15, 2),
	created_at TIMESTAMP WITHOUT TIME ZONE,
	updated_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_ledger_accounts_user_id UNIQUE (user_id, id),
	CONSTRAINT uq_ledger_accounts_user_key UNIQUE (user_id, key),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE ledger_categories (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	key VARCHAR(765) NOT NULL,
	name VARCHAR(255) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ledger_categories_user_id UNIQUE (user_id, id),
	CONSTRAINT uq_ledger_categories_user_key UNIQUE (user_id, key),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE categorization_rules (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	match_field VARCHAR(20) NOT NULL,
	pattern VARCHAR(255) NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	is_active BOOLEAN NOT NULL,
	sort_order INTEGER NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE saved_filter_views (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	name VARCHAR(100) NOT NULL,
	filters TEXT NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE recurring_transactions (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	pattern_name VARCHAR(255) NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	account VARCHAR(255) NOT NULL,
	transaction_type transactiontype NOT NULL,
	frequency recurrencefrequency NOT NULL,
	expected_amount NUMERIC(15, 2) NOT NULL,
	amount_variance NUMERIC(15, 2) NOT NULL,
	expected_day INTEGER,
	confidence_score FLOAT NOT NULL,
	occurrences_detected INTEGER NOT NULL,
	pattern_kind VARCHAR(16) NOT NULL,
	last_occurrence TIMESTAMP WITHOUT TIME ZONE,
	next_expected TIMESTAMP WITHOUT TIME ZONE,
	times_missed INTEGER NOT NULL,
	is_active BOOLEAN NOT NULL,
	is_user_confirmed BOOLEAN NOT NULL,
	first_detected TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	last_updated TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE budgets (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	monthly_limit NUMERIC(15, 2) NOT NULL,
	alert_threshold_pct FLOAT NOT NULL,
	current_month_spent NUMERIC(15, 2) NOT NULL,
	current_month_remaining NUMERIC(15, 2) NOT NULL,
	current_month_pct FLOAT NOT NULL,
	avg_monthly_actual NUMERIC(15, 2) NOT NULL,
	months_over_budget INTEGER NOT NULL,
	months_under_budget INTEGER NOT NULL,
	is_active BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_budget_limit_positive CHECK (monthly_limit > 0),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE financial_goals (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	name VARCHAR(255) NOT NULL,
	description TEXT,
	goal_type VARCHAR(50) NOT NULL,
	target_amount NUMERIC(15, 2) NOT NULL,
	current_amount NUMERIC(15, 2) NOT NULL,
	target_date TIMESTAMP WITHOUT TIME ZONE,
	progress_pct FLOAT NOT NULL,
	monthly_target NUMERIC(15, 2) NOT NULL,
	on_track BOOLEAN NOT NULL,
	status goalstatus NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT '2026-01-01' NOT NULL,
	completed_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT ck_goal_target_positive CHECK (target_amount > 0),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE import_logs (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	file_hash VARCHAR(64) NOT NULL,
	file_name VARCHAR(500) NOT NULL,
	imported_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	rows_processed INTEGER NOT NULL,
	rows_inserted INTEGER NOT NULL,
	rows_updated INTEGER NOT NULL,
	rows_deleted INTEGER NOT NULL,
	rows_skipped INTEGER NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_import_logs_user_file_hash UNIQUE (user_id, file_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE user_preferences (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	fiscal_year_start_month INTEGER NOT NULL,
	essential_categories TEXT NOT NULL,
	investment_account_mappings TEXT NOT NULL,
	taxable_income_categories TEXT NOT NULL,
	investment_returns_categories TEXT NOT NULL,
	non_taxable_income_categories TEXT NOT NULL,
	other_income_categories TEXT NOT NULL,
	capital_loss_categories TEXT DEFAULT '[]' NOT NULL,
	default_budget_alert_threshold FLOAT NOT NULL,
	auto_create_budgets BOOLEAN NOT NULL,
	budget_rollover_enabled BOOLEAN NOT NULL,
	number_format VARCHAR(20) NOT NULL,
	currency_symbol VARCHAR(10) NOT NULL,
	currency_symbol_position VARCHAR(10) NOT NULL,
	default_time_range VARCHAR(20) NOT NULL,
	display_currency VARCHAR(3) NOT NULL,
	anomaly_expense_threshold FLOAT NOT NULL,
	anomaly_types_enabled TEXT NOT NULL,
	auto_dismiss_recurring_anomalies BOOLEAN NOT NULL,
	recurring_min_confidence FLOAT NOT NULL,
	recurring_auto_confirm_occurrences INTEGER NOT NULL,
	needs_target_percent FLOAT NOT NULL,
	wants_target_percent FLOAT NOT NULL,
	savings_target_percent FLOAT NOT NULL,
	earning_start_date VARCHAR(10),
	use_earning_start_date BOOLEAN NOT NULL,
	fixed_expense_categories TEXT NOT NULL,
	savings_goal_percent FLOAT NOT NULL,
	monthly_investment_target FLOAT NOT NULL,
	payday INTEGER NOT NULL,
	preferred_tax_regime VARCHAR(10) NOT NULL,
	excluded_accounts TEXT NOT NULL,
	notify_budget_alerts BOOLEAN NOT NULL,
	notify_anomalies BOOLEAN NOT NULL,
	notify_upcoming_bills BOOLEAN NOT NULL,
	notify_days_ahead INTEGER NOT NULL,
	show_tds_schedule BOOLEAN NOT NULL,
	epf_withdrawal_taxable BOOLEAN NOT NULL,
	epf_taxable_percent INTEGER NOT NULL,
	salary_is_net_of_tds BOOLEAN NOT NULL,
	growth_assumptions TEXT NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
	id SERIAL NOT NULL,
	user_id INTEGER,
	operation VARCHAR(50) NOT NULL,
	entity_type VARCHAR(50) NOT NULL,
	entity_id VARCHAR(64),
	action VARCHAR(20) NOT NULL,
	old_value TEXT,
	new_value TEXT,
	changes_summary TEXT,
	source_file VARCHAR(500),
	user_agent VARCHAR(255),
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE rsu_vestings (
	id TEXT NOT NULL,
	user_id INTEGER NOT NULL,
	grant_id INTEGER NOT NULL,
	position INTEGER NOT NULL,
	date DATE NOT NULL,
	quantity INTEGER NOT NULL,
	price_at_vest NUMERIC,
	net_quantity NUMERIC,
	PRIMARY KEY (id),
	CONSTRAINT fk_rsu_vestings_owner_grant FOREIGN KEY(user_id, grant_id) REFERENCES rsu_grants (user_id, id) ON DELETE CASCADE,
	CONSTRAINT ck_rsu_vestings_position CHECK (position >= 0),
	CONSTRAINT ck_rsu_vestings_quantity CHECK (quantity > 0),
	CONSTRAINT ck_rsu_vestings_price CHECK (price_at_vest IS NULL OR (price_at_vest > 0 AND price_at_vest < CAST('Infinity' AS NUMERIC))),
	CONSTRAINT ck_rsu_vestings_net_quantity CHECK (net_quantity IS NULL OR (net_quantity >= 0 AND net_quantity <= quantity)),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE ledger_account_aliases (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	source_key VARCHAR(765) NOT NULL,
	label VARCHAR(255) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ledger_aliases_user_source UNIQUE (user_id, source_key),
	CONSTRAINT fk_ledger_aliases_account FOREIGN KEY(user_id, account_id) REFERENCES ledger_accounts (user_id, id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE ledger_subcategories (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	category_id INTEGER NOT NULL,
	key VARCHAR(765) NOT NULL,
	name VARCHAR(255) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_ledger_subcategories_user_parent_id UNIQUE (user_id, category_id, id),
	CONSTRAINT uq_ledger_subcategories_user_parent_key UNIQUE (user_id, category_id, key),
	CONSTRAINT fk_ledger_subcategories_category FOREIGN KEY(user_id, category_id) REFERENCES ledger_categories (user_id, id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE scheduled_transactions (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	name VARCHAR(255) NOT NULL,
	amount NUMERIC(15, 2) NOT NULL,
	type transactiontype NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	account VARCHAR(255) NOT NULL,
	frequency recurrencefrequency NOT NULL,
	expected_day INTEGER,
	next_due_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	end_date TIMESTAMP WITHOUT TIME ZONE,
	recurring_transaction_id INTEGER,
	is_active BOOLEAN NOT NULL,
	note TEXT,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT fk_scheduled_user_recurring FOREIGN KEY(user_id, recurring_transaction_id) REFERENCES recurring_transactions (user_id, id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE transactions (
	transaction_id VARCHAR(64) NOT NULL,
	source_fingerprint VARCHAR(64),
	fingerprint_version INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	amount NUMERIC(15, 2) NOT NULL,
	currency VARCHAR(10) NOT NULL,
	type transactiontype NOT NULL,
	account VARCHAR(255) NOT NULL,
	category VARCHAR(255) NOT NULL,
	subcategory VARCHAR(255),
	account_id INTEGER,
	from_account_id INTEGER,
	to_account_id INTEGER,
	category_id INTEGER,
	subcategory_id INTEGER,
	from_account VARCHAR(255),
	to_account VARCHAR(255),
	note TEXT,
	source_file VARCHAR(500) NOT NULL,
	last_seen_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	is_deleted BOOLEAN NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (transaction_id),
	CONSTRAINT uq_transactions_user_id UNIQUE (user_id, transaction_id),
	CONSTRAINT fk_transactions_account_dimension FOREIGN KEY(user_id, account_id) REFERENCES ledger_accounts (user_id, id),
	CONSTRAINT fk_transactions_from_account_dimension FOREIGN KEY(user_id, from_account_id) REFERENCES ledger_accounts (user_id, id),
	CONSTRAINT fk_transactions_to_account_dimension FOREIGN KEY(user_id, to_account_id) REFERENCES ledger_accounts (user_id, id),
	CONSTRAINT fk_transactions_category_dimension FOREIGN KEY(user_id, category_id) REFERENCES ledger_categories (user_id, id),
	CONSTRAINT fk_transactions_subcategory_dimension FOREIGN KEY(user_id, category_id, subcategory_id) REFERENCES ledger_subcategories (user_id, category_id, id),
	CONSTRAINT ck_transactions_subcategory_parent CHECK (subcategory_id IS NULL OR category_id IS NOT NULL),
	CONSTRAINT ck_transactions_amount_bounds CHECK (amount >= 0 AND amount <= 9999999999999.99),
	CONSTRAINT ck_transactions_currency_inr CHECK (currency = 'INR'),
	CONSTRAINT ck_transactions_type CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
	CONSTRAINT ck_transactions_fingerprint_version CHECK (fingerprint_version IN (1, 2)),
	CONSTRAINT ck_transactions_source_fingerprint CHECK (source_fingerprint IS NULL OR (fingerprint_version = 2 AND length(source_fingerprint) = 64 AND trim(source_fingerprint, '0123456789abcdef') = '')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE transaction_tags (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	transaction_id VARCHAR(64) NOT NULL,
	tag VARCHAR(100) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT fk_transaction_tags_user_transaction FOREIGN KEY(user_id, transaction_id) REFERENCES transactions (user_id, transaction_id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE anomalies (
	id SERIAL NOT NULL,
	user_id INTEGER NOT NULL,
	anomaly_type anomalytype NOT NULL,
	severity VARCHAR(20) NOT NULL,
	description TEXT NOT NULL,
	transaction_id VARCHAR(64),
	period_key VARCHAR(7),
	expected_value NUMERIC(15, 2),
	actual_value NUMERIC(15, 2),
	deviation_pct FLOAT,
	is_reviewed BOOLEAN NOT NULL,
	is_dismissed BOOLEAN NOT NULL,
	review_notes TEXT,
	detected_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	reviewed_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT fk_anomalies_user_transaction FOREIGN KEY(user_id, transaction_id) REFERENCES transactions (user_id, transaction_id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_ai_usage_log_timestamp ON ai_usage_log (timestamp);

CREATE INDEX ix_ai_usage_log_user_id ON ai_usage_log (user_id);

CREATE INDEX ix_ai_usage_user_timestamp ON ai_usage_log (user_id, timestamp);

CREATE INDEX ix_anomalies_anomaly_type ON anomalies (anomaly_type);

CREATE INDEX ix_anomalies_user_id ON anomalies (user_id);

CREATE INDEX ix_anomaly_period ON anomalies (period_key);

CREATE INDEX ix_anomaly_type_severity ON anomalies (anomaly_type, severity);

CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);

CREATE INDEX ix_audit_logs_operation ON audit_logs (operation);

CREATE INDEX ix_audit_logs_user_id ON audit_logs (user_id);

CREATE INDEX ix_audit_operation_entity ON audit_logs (operation, entity_type);

CREATE INDEX ix_audit_user ON audit_logs (user_id);

CREATE INDEX ix_budget_user_category ON budgets (user_id, category);

CREATE INDEX ix_budgets_category ON budgets (category);

CREATE INDEX ix_budgets_user_id ON budgets (user_id);

CREATE INDEX ix_categorization_rules_user ON categorization_rules (user_id);

CREATE INDEX ix_category_trend_period_category ON category_trends (period_key, category);

CREATE INDEX ix_category_trend_type ON category_trends (transaction_type);

CREATE INDEX ix_category_trends_category ON category_trends (category);

CREATE INDEX ix_category_trends_period_key ON category_trends (period_key);

CREATE INDEX ix_category_trends_user_id ON category_trends (user_id);

CREATE INDEX ix_cohort_spending_user_id ON cohort_spending (user_id);

CREATE INDEX ix_daily_summaries_user_id ON daily_summaries (user_id);

CREATE INDEX ix_financial_goals_user_id ON financial_goals (user_id);

CREATE INDEX ix_fy_summaries_fiscal_year ON fy_summaries (fiscal_year);

CREATE INDEX ix_fy_summaries_user_id ON fy_summaries (user_id);

CREATE INDEX ix_import_logs_file_hash ON import_logs (file_hash);

CREATE INDEX ix_import_logs_user_id ON import_logs (user_id);

CREATE INDEX ix_investment_account_type ON investment_holdings (account, investment_type);

CREATE INDEX ix_investment_holdings_account ON investment_holdings (account);

CREATE INDEX ix_investment_holdings_user_id ON investment_holdings (user_id);

CREATE INDEX ix_investment_user ON investment_holdings (user_id);

CREATE INDEX ix_merchant_intelligence_merchant_name ON merchant_intelligence (merchant_name);

CREATE INDEX ix_merchant_intelligence_user_id ON merchant_intelligence (user_id);

CREATE INDEX ix_monthly_summaries_period_key ON monthly_summaries (period_key);

CREATE INDEX ix_monthly_summaries_user_id ON monthly_summaries (user_id);

CREATE INDEX ix_monthly_summary_year_month ON monthly_summaries (year, month);

CREATE INDEX ix_net_worth_snapshots_snapshot_date ON net_worth_snapshots (snapshot_date);

CREATE INDEX ix_net_worth_snapshots_user_id ON net_worth_snapshots (user_id);

CREATE INDEX ix_recurring_category_account ON recurring_transactions (category, account);

CREATE INDEX ix_recurring_transactions_user_id ON recurring_transactions (user_id);

CREATE INDEX ix_rsu_vestings_user_grant_position ON rsu_vestings (user_id, grant_id, position);

CREATE INDEX ix_scheduled_transactions_is_active ON scheduled_transactions (is_active);

CREATE INDEX ix_scheduled_transactions_next_due_date ON scheduled_transactions (next_due_date);

CREATE INDEX ix_scheduled_transactions_user_id ON scheduled_transactions (user_id);

CREATE INDEX ix_scheduled_user_active ON scheduled_transactions (user_id, is_active);

CREATE INDEX ix_scheduled_user_active_due ON scheduled_transactions (user_id, is_active, next_due_date);

CREATE INDEX ix_tax_records_user_fy ON tax_records (user_id, financial_year);

CREATE INDEX ix_tax_records_user_id ON tax_records (user_id);

CREATE INDEX ix_transaction_tags_user_tag ON transaction_tags (user_id, tag);

CREATE INDEX ix_transactions_last_seen_at ON transactions (last_seen_at);

CREATE INDEX ix_transactions_user_account ON transactions (user_id, account) WHERE is_deleted IS false;

CREATE INDEX ix_transactions_user_category ON transactions (user_id, category) WHERE is_deleted IS false;

CREATE INDEX ix_transactions_user_date ON transactions (user_id, date) WHERE is_deleted IS false;

CREATE INDEX ix_transactions_user_from_account ON transactions (user_id, from_account) WHERE is_deleted IS false;

CREATE INDEX ix_transactions_user_id ON transactions (user_id);

CREATE INDEX ix_transactions_user_to_account ON transactions (user_id, to_account) WHERE is_deleted IS false;

CREATE INDEX ix_transactions_user_type_date ON transactions (user_id, type, date) WHERE is_deleted IS false;

CREATE INDEX ix_transfer_flows_from_account ON transfer_flows (from_account);

CREATE INDEX ix_transfer_flows_to_account ON transfer_flows (to_account);

CREATE INDEX ix_transfer_flows_user_id ON transfer_flows (user_id);

CREATE INDEX ix_users_auth_provider ON users (auth_provider);

CREATE UNIQUE INDEX ix_cohort_spending_user_dim ON cohort_spending (user_id, dimension, bucket);

CREATE UNIQUE INDEX ix_daily_summary_user_date ON daily_summaries (user_id, date);

CREATE UNIQUE INDEX ix_monthly_summary_user_period ON monthly_summaries (user_id, period_key);

CREATE UNIQUE INDEX ix_saved_filter_views_user_name ON saved_filter_views (user_id, name);

CREATE UNIQUE INDEX ix_transaction_tags_user_txn_tag ON transaction_tags (user_id, transaction_id, tag);

CREATE UNIQUE INDEX ix_transfer_flow_accounts ON transfer_flows (user_id, from_account, to_account);

CREATE UNIQUE INDEX ix_user_preferences_user_id ON user_preferences (user_id);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE UNIQUE INDEX uq_budget_user_category_null ON budgets (user_id, category) WHERE subcategory IS NULL;

CREATE UNIQUE INDEX uq_budget_user_category_subcategory ON budgets (user_id, category, subcategory) WHERE subcategory IS NOT NULL;

CREATE UNIQUE INDEX uq_category_trends_user_scope_null ON category_trends (user_id, period_key, category, transaction_type) WHERE subcategory IS NULL;

CREATE UNIQUE INDEX uq_category_trends_user_scope_subcategory ON category_trends (user_id, period_key, category, subcategory, transaction_type) WHERE subcategory IS NOT NULL;

CREATE UNIQUE INDEX uq_fy_summaries_user_fiscal_year ON fy_summaries (user_id, fiscal_year);

CREATE UNIQUE INDEX uq_merchant_intelligence_user_label ON merchant_intelligence (user_id, merchant_name, label_kind);

CREATE UNIQUE INDEX uq_recurring_transactions_user_id ON recurring_transactions (user_id, id);

CREATE UNIQUE INDEX uq_transactions_source ON transactions (user_id, source_fingerprint);
