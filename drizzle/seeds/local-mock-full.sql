-- Reset non-OCR tables for repeatable local testing (Wave 2.2: dropped customers,
-- employees, invoices_in, invoices_out, payments — see Migration Plan).
DELETE FROM audit_logs;
DELETE FROM sessions;
DELETE FROM accounts;
DELETE FROM verifications;
DELETE FROM employee_salaries;
DELETE FROM payout_records;
DELETE FROM compensation_components;
DELETE FROM project_employees;
DELETE FROM employee_project_allocations;
DELETE FROM employee_compensation_components;
DELETE FROM purchase_orders;
DELETE FROM quotations;
DELETE FROM contracts;
DELETE FROM expenses;
DELETE FROM gst_returns;
DELETE FROM company_settings;
DELETE FROM expense_categories;
DELETE FROM projects;
DELETE FROM partner_supplier_evaluations;
DELETE FROM employee_profiles;
DELETE FROM person_roles;
DELETE FROM persons;
DELETE FROM business_partners;
DELETE FROM users;

-- Auth: use /register + email verification (better-auth). No SQL user rows — passwords live in `accounts`.

-- Customers (Wave 2.2: now stored in business_partners with type='customer')
INSERT INTO business_partners (id, name, type, address, contact, gst_reg_no, metadata, created_at, updated_at, deleted_at)
VALUES
	('cust-demo-001', 'Demo Trading Pte Ltd', 'customer', '1 Raffles Place, Singapore', 'finance@demotrading.sg', 'GST-REG-DEMO-001', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cust-demo-002', 'Lion City Imports', 'customer', '80 Robinson Road, Singapore', 'ops@lioncity-imports.sg', 'GST-REG-DEMO-002', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cust-demo-003', 'Harbourline Logistics', 'customer', '10 Anson Road, Singapore', 'accounts@harbourline.sg', 'GST-REG-DEMO-003', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Projects
INSERT INTO projects (id, business_partner_id, name, status, start_date, end_date, description, created_at, updated_at, deleted_at)
VALUES
	(
		'proj-demo-001',
		'cust-demo-001',
		'Indonesia Palm Oil Import FY26',
		'active',
		'2026-01-02',
		'2026-12-31',
		'Core import operation with monthly billing.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-002',
		'cust-demo-002',
		'Malaysia Spare Parts Consolidation',
		'on_hold',
		'2026-01-15',
		'2026-09-30',
		'On hold due to supplier lead-time revision.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-003',
		'cust-demo-003',
		'Thailand Fast-Moving Goods Pilot',
		'completed',
		'2025-10-01',
		'2026-02-28',
		'Completed pilot batch and final settlement.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-004',
		'cust-demo-001',
		'Legacy Archive Project',
		'archived',
		'2025-01-01',
		'2025-10-30',
		'Archived for regression filtering checks.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-005',
		'cust-demo-002',
		'Vietnam Consumer Goods Expansion',
		'active',
		'2025-07-01',
		'2026-12-31',
		'Cross-border expansion with quarterly billing milestones.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-006',
		'cust-demo-003',
		'Philippines Cold Chain Setup',
		'on_hold',
		'2025-09-10',
		'2026-10-31',
		'On hold pending cold-room vendor approval.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-007',
		'cust-demo-001',
		'Myanmar Rice Procurement FY25-26',
		'active',
		'2025-11-05',
		'2026-08-31',
		'Active commodity procurement with monthly settlement.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-008',
		'cust-demo-003',
		'Borneo Agro Transshipment',
		'on_hold',
		'2026-02-01',
		'2026-12-15',
		'Paused for route permit confirmation.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'proj-demo-009',
		'cust-demo-002',
		'Singapore Re-export Hub Q2 Launch',
		'active',
		'2026-04-01',
		'2027-03-31',
		'Q2 launch project for re-export operations.',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	);

-- AR contracts and quotations
INSERT INTO contracts (id, project_id, file_url, amount, currency, effective_date, metadata, created_at, updated_at, deleted_at)
VALUES
	('ctr-demo-001', 'proj-demo-001', 'mock://contracts/ctr-demo-001.pdf', 180000, 'SGD', '2026-01-05', '{"version":"v1"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-002', 'proj-demo-002', 'mock://contracts/ctr-demo-002.pdf', 90000, 'SGD', '2026-01-20', '{"version":"v1"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-003', 'proj-demo-005', 'mock://contracts/ctr-demo-003.pdf', 140000, 'SGD', '2025-07-08', '{"version":"v2"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-004', 'proj-demo-006', 'mock://contracts/ctr-demo-004.pdf', 76000, 'SGD', '2025-09-15', '{"version":"v1"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-005', 'proj-demo-007', 'mock://contracts/ctr-demo-005.pdf', 128000, 'SGD', '2025-11-08', '{"version":"v2"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-006', 'proj-demo-008', 'mock://contracts/ctr-demo-006.pdf', 68000, 'SGD', '2026-02-03', '{"version":"v1"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ctr-demo-007', 'proj-demo-009', 'mock://contracts/ctr-demo-007.pdf', 112000, 'SGD', '2026-04-05', '{"version":"v1"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO quotations (id, project_id, file_url, amount, currency, date, metadata, created_at, updated_at, deleted_at)
VALUES
	('quo-demo-001', 'proj-demo-001', 'mock://quotations/quo-demo-001.pdf', 72000, 'SGD', '2026-02-03', '{"round":"R1","source_type":"customer"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-002', 'proj-demo-002', 'mock://quotations/quo-demo-002.pdf', 35000, 'SGD', '2026-02-12', '{"round":"R1","source_type":"internal"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-003', 'proj-demo-005', 'mock://quotations/quo-demo-003.pdf', 48000, 'SGD', '2025-08-01', '{"round":"R2","source_type":"customer"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-004', 'proj-demo-006', 'mock://quotations/quo-demo-004.pdf', 26000, 'SGD', '2025-10-11', '{"round":"R1","source_type":"internal"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-005', 'proj-demo-007', 'mock://quotations/quo-demo-005.pdf', 53000, 'SGD', '2025-12-04', '{"round":"R2","source_type":"customer"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-006', 'proj-demo-008', 'mock://quotations/quo-demo-006.pdf', 22000, 'SGD', '2026-02-20', '{"round":"R1","source_type":"internal"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('quo-demo-007', 'proj-demo-009', 'mock://quotations/quo-demo-007.pdf', 39000, 'SGD', '2026-04-12', '{"round":"R1","source_type":"customer"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Purchase orders and supplier invoices (kept as mock non-OCR flow)
INSERT INTO purchase_orders (id, project_id, po_number, file_url, supplier_name, amount, currency, date, created_at, updated_at, deleted_at)
VALUES
	('po-demo-001', 'proj-demo-001', 'PO-2026-001', 'mock://po/po-demo-001.pdf', 'PT Nusantara Supply', 42000, 'SGD', '2026-03-02', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-002', 'proj-demo-002', 'PO-2026-002', 'mock://po/po-demo-002.pdf', 'KL Spare Parts Sdn Bhd', 15000, 'SGD', '2026-03-05', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-003', 'proj-demo-005', 'PO-2025-073', 'mock://po/po-demo-003.pdf', 'Saigon Retail Supply JSC', 21000, 'SGD', '2025-08-14', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-004', 'proj-demo-006', 'PO-2025-104', 'mock://po/po-demo-004.pdf', 'Manila Cold Storage Corp', 9800, 'SGD', '2025-10-22', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-005', 'proj-demo-007', 'PO-2025-122', 'mock://po/po-demo-005.pdf', 'Yangon Agro Milling Co', 17500, 'SGD', '2025-12-11', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-006', 'proj-demo-008', 'PO-2026-021', 'mock://po/po-demo-006.pdf', 'Borneo Port Services', 11200, 'SGD', '2026-02-15', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('po-demo-007', 'proj-demo-009', 'PO-2026-041', 'mock://po/po-demo-007.pdf', 'Jurong Re-export Services', 18900, 'SGD', '2026-04-18', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);


-- Employees and compensation (Wave 2.2: persons + employee_profiles replace legacy employees)
INSERT INTO persons (id, name, email, phone, tax_id, metadata, created_at, updated_at, deleted_at)
VALUES
	('emp-demo-001', 'Alice Tan', 'alice.tan@smartfin.local', NULL, 'S1234567A', '{"dept":"operations"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('emp-demo-002', 'Rahim Iskandar', 'rahim@smartfin.local', NULL, 'S2345678B', '{"dept":"finance"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('emp-demo-003', 'Wang Lei', 'wang.lei@smartfin.local', NULL, 'F3344556C', '{"dept":"trade"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_profiles (id, person_id, employment_type, status, start_date, end_date, cpf_applicable, tax_resident_label, location, metadata, created_at, updated_at, deleted_at)
VALUES
	('prof-demo-001', 'emp-demo-001', 'full_time', 'active', '2025-08-01', NULL, 1, 'Singapore citizen', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prof-demo-002', 'emp-demo-002', 'part_time', 'active', '2025-11-01', NULL, 1, 'Singapore PR', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prof-demo-003', 'emp-demo-003', 'freelancer', 'active', '2026-01-10', NULL, 1, 'Non-resident', NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_compensation_components (id, employee_id, label, income_type, rule_type, value, floor, cap, frequency, taxable, effective_from, effective_to, created_at, updated_at, deleted_at)
VALUES
	('ecc-demo-001', 'emp-demo-001', '基本工资', 'salary', 'fixed', 5200, NULL, NULL, 'monthly', 1, '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ecc-demo-002', 'emp-demo-001', '交通津贴', 'allowance', 'fixed', 200, NULL, NULL, 'monthly', 1, '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_project_allocations (id, employee_id, project_id, weight_pct, allocation_mode, effective_from, effective_to, created_at, updated_at, deleted_at)
VALUES
	('epa-demo-001', 'emp-demo-001', 'proj-demo-001', 60, 'manual', '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('epa-demo-002', 'emp-demo-001', 'proj-demo-002', 40, 'manual', '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_salaries (id, employee_id, month, salary, allowance, cpf_employee, cpf_employer, created_at, updated_at, deleted_at)
VALUES
	('sal-demo-001', 'emp-demo-001', '2026-03', 6800, 500, 1360, 1156, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('sal-demo-002', 'emp-demo-002', '2026-03', 3200, 180, 640, 544, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('sal-demo-003', 'emp-demo-003', '2026-03', 4500, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO project_employees (id, project_id, person_id, name, role, staff_type, date_in, date_out, cpf_applicable, created_at, updated_at, deleted_at)
VALUES
	('pe-proj-demo-001-emp-demo-001', 'proj-demo-001', 'emp-demo-001', 'Alice Tan', NULL, 'fulltime', '2025-08-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-001-emp-demo-003', 'proj-demo-001', 'emp-demo-003', 'Wang Lei', NULL, 'freelancer', '2026-01-10', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-002-emp-demo-002', 'proj-demo-002', 'emp-demo-002', 'Rahim Iskandar', NULL, 'parttime', '2025-11-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-005-emp-demo-001', 'proj-demo-005', 'emp-demo-001', 'Alice Tan', NULL, 'fulltime', '2025-08-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-006-emp-demo-002', 'proj-demo-006', 'emp-demo-002', 'Rahim Iskandar', NULL, 'parttime', '2025-11-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-007-emp-demo-003', 'proj-demo-007', 'emp-demo-003', 'Wang Lei', NULL, 'freelancer', '2026-01-10', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pe-proj-demo-009-emp-demo-001', 'proj-demo-009', 'emp-demo-001', 'Alice Tan', NULL, 'fulltime', '2025-08-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO compensation_components (id, project_employee_id, label, income_type, rule_type, value, floor, cap, frequency, taxable, effective_from, effective_to, created_at, updated_at, deleted_at)
VALUES
	('cc-demo-001', 'pe-proj-demo-001-emp-demo-001', 'bonus', 'bonus', 'manual', 2400, NULL, NULL, 'one_off', 1, '2026-03-16', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-002', 'pe-proj-demo-001-emp-demo-003', 'freelance_fee', 'allowance', 'manual', 1900, NULL, NULL, 'one_off', 1, '2026-03-20', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-003', 'pe-proj-demo-002-emp-demo-002', 'bonus', 'bonus', 'manual', 850, NULL, NULL, 'one_off', 1, '2026-03-22', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-004', 'pe-proj-demo-005-emp-demo-001', 'bonus', 'bonus', 'manual', 1200, NULL, NULL, 'one_off', 1, '2025-08-29', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-005', 'pe-proj-demo-006-emp-demo-002', 'bonus', 'bonus', 'manual', 760, NULL, NULL, 'one_off', 1, '2025-10-31', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-006', 'pe-proj-demo-007-emp-demo-003', 'freelance_fee', 'allowance', 'manual', 990, NULL, NULL, 'one_off', 1, '2025-12-23', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cc-demo-007', 'pe-proj-demo-009-emp-demo-001', 'bonus', 'bonus', 'manual', 1450, NULL, NULL, 'one_off', 1, '2026-04-30', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO payout_records (id, component_id, project_id, period, base_value, computed_amount, cpf_employee, cpf_employer, taxable_amount, status, note, created_at, updated_at, deleted_at)
VALUES
	('pay-demo-001', 'cc-demo-001', 'proj-demo-001', '2026-03-16', 2400, 2400, 0, 0, 2400, 'confirmed', 'On-time customs clearance milestone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-002', 'cc-demo-002', 'proj-demo-001', '2026-03-20', 1900, 1900, 0, 0, 1900, 'confirmed', 'Trade document review support', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-003', 'cc-demo-003', 'proj-demo-002', '2026-03-22', 850, 850, 0, 0, 850, 'confirmed', 'Supplier reconciliation support', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-004', 'cc-demo-004', 'proj-demo-005', '2025-08-29', 1200, 1200, 0, 0, 1200, 'confirmed', 'Vietnam expansion milestone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-005', 'cc-demo-005', 'proj-demo-006', '2025-10-31', 760, 760, 0, 0, 760, 'confirmed', 'Cold chain supplier onboarding', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-006', 'cc-demo-006', 'proj-demo-007', '2025-12-23', 990, 990, 0, 0, 990, 'confirmed', 'Commodity risk advisory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pay-demo-007', 'cc-demo-007', 'proj-demo-009', '2026-04-30', 1450, 1450, 0, 0, 1450, 'confirmed', 'Re-export launch execution', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Expenses
INSERT INTO expense_categories (id, name, is_system, parent_id, created_at, updated_at, deleted_at)
VALUES
	('cat-demo-001', 'Logistics', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cat-demo-002', 'Travel', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cat-demo-003', 'Compliance', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO expenses (id, project_id, expense_type, category, amount, currency, date, staff_name, document_ref, metadata, created_at, updated_at, deleted_at)
VALUES
	('exp-demo-001', 'proj-demo-001', 'opex', 'Logistics', 3200, 'SGD', '2026-03-08', 'Alice Tan', 'mock://expenses/exp-demo-001.pdf', '{"channel":"mock-seed","subcategory":"Port handling"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-002', 'proj-demo-002', 'opex', 'Compliance', 1200, 'SGD', '2026-03-12', 'Rahim Iskandar', 'mock://expenses/exp-demo-002.pdf', '{"channel":"mock-seed","subcategory":"Import permit"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-003', 'proj-demo-005', 'opex', 'Travel', 1800, 'SGD', '2025-08-18', 'Alice Tan', 'mock://expenses/exp-demo-003.pdf', '{"channel":"mock-seed","subcategory":"Supplier visit"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-004', 'proj-demo-006', 'opex', 'Compliance', 950, 'SGD', '2025-10-26', 'Rahim Iskandar', 'mock://expenses/exp-demo-004.pdf', '{"channel":"mock-seed","subcategory":"Cold-room permit"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-005', 'proj-demo-007', 'opex', 'Logistics', 2100, 'SGD', '2025-12-19', 'Wang Lei', 'mock://expenses/exp-demo-005.pdf', '{"channel":"mock-seed","subcategory":"Warehouse handling"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-006', 'proj-demo-008', 'opex', 'Travel', 780, 'SGD', '2026-02-27', 'Rahim Iskandar', 'mock://expenses/exp-demo-006.pdf', '{"channel":"mock-seed","subcategory":"Route survey"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-007', 'proj-demo-009', 'opex', 'Logistics', 2300, 'SGD', '2026-04-26', 'Alice Tan', 'mock://expenses/exp-demo-007.pdf', '{"channel":"mock-seed","subcategory":"Port operation prep"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Tax settings and sample GST return
INSERT INTO company_settings (key, value, created_at, updated_at, deleted_at)
VALUES
	('gst_box9_manual', '1200', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('gst_box10_manual', '800', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('gst_box11_manual', '500', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('gst_box12_manual', '2000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO gst_returns (id, quarter, year, box_1, box_2, box_3, box_4, box_5, box_6, box_7, box_8, box_9, box_10, box_11, box_12, box_13, status, generated_at, created_at, updated_at, deleted_at)
VALUES
	(
		'gst-demo-2026-q1',
		'Q1',
		'2026',
		85000,
		0,
		85000,
		7650,
		59400,
		5346,
		2304,
		0,
		1200,
		800,
		500,
		2000,
		125000,
		'draft',
		'2026-03-29T12:00:00Z',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	);

-- Audit log samples
INSERT INTO audit_logs (id, actor_user_id, actor_email, action, entity_type, entity_id, project_id, metadata, created_at, updated_at, deleted_at)
VALUES
	(
		'audit-demo-001',
		NULL,
		'owner@smartfin.local',
		'login',
		'auth',
		NULL,
		NULL,
		'{"source":"mock-seed"}',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	),
	(
		'audit-demo-002',
		NULL,
		'finance@smartfin.local',
		'project.update',
		'project',
		'proj-demo-001',
		'proj-demo-001',
		'{"source":"mock-seed","name":"Demo Project Alpha"}',
		CURRENT_TIMESTAMP,
		CURRENT_TIMESTAMP,
		NULL
	);
