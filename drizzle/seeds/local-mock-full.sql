-- Reset local mock tables for repeatable local testing only.
-- Auth passwords still live in better-auth `accounts`; this seed only creates
-- user rows for owners/collaborators/audit display.
DELETE FROM audit_logs;
DELETE FROM sessions;
DELETE FROM accounts;
DELETE FROM verifications;
DELETE FROM user_person_links;
DELETE FROM invite_codes;
DELETE FROM upload_idempotency;
DELETE FROM upload_file_dedup;
DELETE FROM overtime_approval_records;
DELETE FROM overtime_requests;
DELETE FROM attendance_records;
DELETE FROM leave_approval_records;
DELETE FROM leave_balances;
DELETE FROM leave_requests;
DELETE FROM leave_types;
DELETE FROM inventory_cycle_count_lines;
DELETE FROM inventory_cycle_counts;
DELETE FROM inventory_stock_transfer_lines;
DELETE FROM inventory_stock_transfers;
DELETE FROM inventory_stock_movements;
DELETE FROM inventory_stock_levels;
DELETE FROM warehouse_bin_locations;
DELETE FROM warehouses;
DELETE FROM inventory_item_barcodes;
DELETE FROM inventory_item_attachments;
DELETE FROM items;
DELETE FROM procurement_purchase_order_receipts;
DELETE FROM procurement_purchase_order_items;
DELETE FROM procurement_purchase_orders;
DELETE FROM procurement_supplier_quotation_items;
DELETE FROM procurement_supplier_quotations;
DELETE FROM procurement_rfq_suppliers;
DELETE FROM procurement_rfq_items;
DELETE FROM procurement_rfqs;
DELETE FROM partner_supplier_evaluations;
DELETE FROM partner_supplier_attachments;
DELETE FROM partner_supplier_compliance_records;
DELETE FROM partner_contacts;
DELETE FROM partner_supplier_profiles;
DELETE FROM partner_customer_profiles;
DELETE FROM ar_document_links;
DELETE FROM documents;
DELETE FROM document_artifacts;
DELETE FROM business_trips;
DELETE FROM person_income;
DELETE FROM time_logs;
DELETE FROM revenue;
DELETE FROM expenses;
DELETE FROM gst_returns;
DELETE FROM company_settings;
DELETE FROM expense_categories;
DELETE FROM employee_salaries;
DELETE FROM payout_records;
DELETE FROM compensation_components;
DELETE FROM project_employees;
DELETE FROM employee_project_allocations;
DELETE FROM employee_compensation_components;
DELETE FROM project_comments;
DELETE FROM project_collaborators;
DELETE FROM purchase_orders;
DELETE FROM quotations;
DELETE FROM contracts;
DELETE FROM projects;
DELETE FROM freelancer_profiles;
DELETE FROM shareholder_profiles;
DELETE FROM employee_profiles;
DELETE FROM person_roles;
DELETE FROM persons;
DELETE FROM business_partners;
DELETE FROM users;

-- Auth users: display/test identities only. Use /register to create real login accounts.
INSERT INTO users (id, email, name, email_verified, image, role, created_at, updated_at, deleted_at)
VALUES
	('user-owner-demo', 'owner@smartfin.local', 'Demo Owner', 1, NULL, '["owner"]', 1767225600000, 1767225600000, NULL),
	('user-admin-demo', 'admin@smartfin.local', 'Operations Admin', 1, NULL, '["admin"]', 1767225600000, 1767225600000, NULL),
	('user-finance-demo', 'finance@smartfin.local', 'Finance Reviewer', 1, NULL, '["finance"]', 1767225600000, 1767225600000, NULL),
	('user-pm-demo', 'pm@smartfin.local', 'Project Manager', 1, NULL, '["project_manager"]', 1767225600000, 1767225600000, NULL),
	('user-hr-demo', 'hr@smartfin.local', 'HR Partner', 1, NULL, '["hr"]', 1767225600000, 1767225600000, NULL),
	('user-staff-demo', 'staff@smartfin.local', 'Staff User', 1, NULL, '["staff"]', 1767225600000, 1767225600000, NULL);

INSERT INTO invite_codes (id, code, roles, created_by, used_by, used_at, expires_at, max_uses, use_count, label, created_at, updated_at, deleted_at)
VALUES
	('invite-demo-finance', 'LOCAL-FINANCE-DEMO', '["finance"]', 'user-owner-demo', NULL, NULL, '2026-12-31T23:59:59Z', 3, 0, 'Local finance reviewers', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('invite-demo-hr-used', 'LOCAL-HR-USED', '["hr"]', 'user-owner-demo', 'user-hr-demo', '2026-06-01T09:30:00Z', '2026-12-31T23:59:59Z', 1, 1, 'Used HR invite example', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Customers (Wave 2.2: now stored in business_partners with type='customer')
INSERT INTO business_partners (id, name, type, address, contact, gst_reg_no, metadata, created_at, updated_at, deleted_at)
VALUES
	('cust-demo-001', 'Demo Trading Pte Ltd', 'customer', '1 Raffles Place, Singapore', 'finance@demotrading.sg', 'GST-REG-DEMO-001', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cust-demo-002', 'Lion City Imports', 'customer', '80 Robinson Road, Singapore', 'ops@lioncity-imports.sg', 'GST-REG-DEMO-002', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('cust-demo-003', 'Harbourline Logistics', 'customer', '10 Anson Road, Singapore', 'accounts@harbourline.sg', 'GST-REG-DEMO-003', '{"source":"mock-seed"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_customer_profiles (id, partner_id, credit_limit, billing_terms, customer_tier, created_at, updated_at, deleted_at)
VALUES
	('pcp-demo-001', 'cust-demo-001', '250000', 'Net 30', 'strategic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pcp-demo-002', 'cust-demo-002', '120000', 'Net 15', 'growth', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pcp-demo-003', 'cust-demo-003', '180000', 'Net 30', 'enterprise', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Suppliers for procurement and inventory flows
INSERT INTO business_partners (id, name, type, registration_no, country, address, contact, item_description, currency, gst_reg_no, metadata, created_at, updated_at, deleted_at)
VALUES
	('sup-demo-001', 'Nusantara Agro Supply Pte Ltd', 'supplier', '202612345K', 'Singapore', '22 Tuas Avenue 8, Singapore', 'sales@nusantara-agro.local', 'Palm oil and agro commodity feedstock', 'SGD', 'M2-3456789-0', '{"source":"mock-seed","risk":"medium"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('sup-demo-002', 'KL Spare Parts Sdn Bhd', 'supplier', 'MY-2019012345', 'Malaysia', '15 Jalan Industri, Shah Alam', 'rfq@klspares.local', 'Industrial spare parts and fittings', 'MYR', NULL, '{"source":"mock-seed","risk":"low"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('sup-demo-003', 'Borneo Port Services', 'supplier', 'BN-998812', 'Brunei', 'Muara Port Logistics Park', 'ops@borneo-port.local', 'Port handling and transshipment services', 'SGD', NULL, '{"source":"mock-seed","risk":"medium"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('sup-demo-004', 'Jurong Cold Chain Components', 'supplier', '202655551H', 'Singapore', '7 Pioneer Road North, Singapore', 'quotes@jurongcold.local', 'Cold-chain packaging and warehouse consumables', 'SGD', 'M2-5551111-8', '{"source":"mock-seed","risk":"high"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_profiles (
	id, partner_id, supplier_type, supplier_status, acra_uen, business_registration_no,
	gst_registration_status, tax_code, billing_address, shipping_address, bank_name,
	bank_account_no, swift_code, credit_terms, payment_terms, preferred_currency,
	supplier_category, created_at, updated_at, deleted_at
)
VALUES
	('psp-demo-001', 'sup-demo-001', 'corporate_local', 'preferred', '202612345K', NULL, 'registered', 'SR', '22 Tuas Avenue 8, Singapore', '22 Tuas Avenue 8, Singapore', 'DBS Bank', '001-223344-9', 'DBSSSGSG', 'Net 30', 'Bank transfer after GRN', 'SGD', 'Agro Feedstock', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psp-demo-002', 'sup-demo-002', 'corporate_international', 'approved', NULL, 'MY-2019012345', 'not_registered', 'OP', '15 Jalan Industri, Shah Alam', '15 Jalan Industri, Shah Alam', 'Maybank', '514-882991-0', 'MBBEMYKL', 'Net 45', 'Telegraphic transfer', 'MYR', 'Industrial Parts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psp-demo-003', 'sup-demo-003', 'corporate_international', 'approved', NULL, 'BN-998812', 'unknown', 'OP', 'Muara Port Logistics Park', 'Muara Port Logistics Park', 'Standard Chartered', '880-120009-1', 'SCBLBNBB', 'Net 14', 'Milestone billing', 'SGD', 'Logistics Services', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psp-demo-004', 'sup-demo-004', 'corporate_local', 'on_hold', '202655551H', NULL, 'registered', 'SR', '7 Pioneer Road North, Singapore', '7 Pioneer Road North, Singapore', 'OCBC', '585-778812-0', 'OCBCSGSG', 'Net 30', 'Bank transfer after QC', 'SGD', 'Cold Chain Materials', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_contacts (id, partner_id, name, phone_email, wechat, position, created_at, updated_at, deleted_at)
VALUES
	('pc-demo-001', 'sup-demo-001', 'Siti Rahman', 'siti@nusantara-agro.local / +65 6123 4501', NULL, 'Account Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pc-demo-002', 'sup-demo-002', 'Lim Wei Jian', 'lim@klspares.local / +60 3 7788 1002', 'lim-klspares', 'Sales Lead', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pc-demo-003', 'sup-demo-003', 'Daniel Ong', 'daniel@borneo-port.local / +673 223 1900', NULL, 'Operations Coordinator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pc-demo-004', 'sup-demo-004', 'Priya Menon', 'priya@jurongcold.local / +65 6899 1144', NULL, 'Quality Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_compliance_records (id, partner_id, record_type, title, issuer, reference_no, issue_date, expiry_date, status, notes, created_at, updated_at, deleted_at)
VALUES
	('psc-demo-001', 'sup-demo-001', 'certificate', 'ISO 9001 Certificate', 'SGS', 'ISO-SG-2026-001', '2026-01-01', '2027-01-01', 'valid', 'Annual surveillance due in Q4.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psc-demo-002', 'sup-demo-003', 'permit', 'Port Handling Permit', 'Muara Port Authority', 'MPA-2026-188', '2026-02-10', '2026-08-31', 'expiring', 'Renewal reminder for August.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psc-demo-003', 'sup-demo-004', 'insurance', 'Product Liability Insurance', 'Aon Singapore', 'PLI-CC-5531', '2025-11-01', '2026-10-31', 'pending_review', 'Coverage limit needs finance review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_attachments (id, partner_id, attachment_type, title, file_name, file_url, expiry_date, notes, created_at, updated_at, deleted_at)
VALUES
	('psa-demo-001', 'sup-demo-001', 'certificate', 'ISO 9001 Certificate PDF', 'nusantara-iso9001.pdf', 'mock://suppliers/sup-demo-001/iso9001.pdf', '2027-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psa-demo-002', 'sup-demo-003', 'permit', 'Port Permit PDF', 'borneo-port-permit.pdf', 'mock://suppliers/sup-demo-003/permit.pdf', '2026-08-31', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psa-demo-003', 'sup-demo-004', 'insurance', 'Insurance Cover Note', 'jurong-cold-insurance.pdf', 'mock://suppliers/sup-demo-004/insurance.pdf', '2026-10-31', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_evaluations (
	id, partner_id, evaluation_date, evaluation_category, evaluator_user_id, evaluator_email,
	defect_rate, return_rate, on_time_delivery_pct, lead_time_reliability_score,
	price_competitiveness_score, payment_terms_score, responsiveness_score,
	after_sales_support_score, certification_score, credit_check_score,
	environmental_compliance_score, quality_score, delivery_score, price_score,
	service_score, compliance_score, financial_stability_score, sustainability_score,
	overall_score, overall_rating, notes, created_at, updated_at, deleted_at
)
VALUES
	('pse-demo-001', 'sup-demo-001', '2026-05-20', 'quarterly', 'user-pm-demo', 'pm@smartfin.local', 1.2, 0.4, 96, 91, 84, 78, 88, 82, 90, 80, 76, 89, 92, 83, 86, 88, 80, 76, 87, 'gold', 'Preferred for high-volume feedstock.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pse-demo-002', 'sup-demo-002', '2026-05-22', 'rfq_review', 'user-pm-demo', 'pm@smartfin.local', 2.8, 1.1, 88, 82, 91, 74, 79, 75, 70, 78, 65, 80, 84, 90, 78, 72, 76, 65, 79, 'silver', 'Good price, monitor lead-time swings.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pse-demo-003', 'sup-demo-004', '2026-05-25', 'risk_review', 'user-finance-demo', 'finance@smartfin.local', 5.4, 2.2, 72, 68, 73, 70, 61, 64, 62, 60, 58, 64, 70, 74, 62, 60, 65, 58, 64, 'bronze', 'On hold until insurance review clears.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

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

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'delivery',
	deadline = '2026-06-30',
	notes = 'Priority customs lane and monthly customer billing.',
	priority = 8,
	attachment_url = 'mock://projects/proj-demo-001/brief.pdf',
	attachment_name = 'Indonesia import brief.pdf'
WHERE id = 'proj-demo-001';

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'delivery',
	deadline = '2026-07-15',
	notes = 'Supplier lead-time risk under review.',
	priority = 6
WHERE id = 'proj-demo-002';

UPDATE projects
SET owner_id = 'user-admin-demo',
	type = 'ongoing',
	deadline = '2026-02-28',
	notes = 'Final settlement completed and ready for archive review.',
	priority = 3
WHERE id = 'proj-demo-003';

UPDATE projects
SET owner_id = 'user-owner-demo',
	type = 'internal',
	deadline = '2025-10-30',
	notes = 'Legacy archive sample for filters.',
	priority = 2
WHERE id = 'proj-demo-004';

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'delivery',
	deadline = '2026-09-30',
	notes = 'Quarterly billing milestones and supplier onboarding.',
	priority = 7,
	recurrence_frequency = 'monthly',
	recurrence_interval = 1
WHERE id = 'proj-demo-005';

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'delivery',
	deadline = '2026-08-31',
	notes = 'Cold-room vendor approval pending.',
	priority = 5
WHERE id = 'proj-demo-006';

UPDATE projects
SET owner_id = 'user-finance-demo',
	type = 'delivery',
	deadline = '2026-05-31',
	notes = 'Commodity procurement settlement and finance review.',
	priority = 7
WHERE id = 'proj-demo-007';

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'delivery',
	deadline = '2026-06-20',
	notes = 'Route permit confirmation controls start date.',
	priority = 4
WHERE id = 'proj-demo-008';

UPDATE projects
SET owner_id = 'user-pm-demo',
	type = 'ongoing',
	deadline = '2026-06-10',
	notes = 'Launch readiness project for Q2 re-export operations.',
	priority = 9
WHERE id = 'proj-demo-009';

INSERT INTO project_collaborators (id, project_id, user_id, role, created_at, updated_at, deleted_at)
VALUES
	('pcollab-demo-001', 'proj-demo-001', 'user-finance-demo', 'finance reviewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pcollab-demo-002', 'proj-demo-001', 'user-staff-demo', 'operations coordinator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pcollab-demo-003', 'proj-demo-005', 'user-finance-demo', 'billing reviewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pcollab-demo-004', 'proj-demo-009', 'user-admin-demo', 'launch approver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO project_comments (id, project_id, author_user_id, author_email, author_name, body, mentions, created_at, updated_at, deleted_at)
VALUES
	('pcomment-demo-001', 'proj-demo-001', 'user-pm-demo', 'pm@smartfin.local', 'Project Manager', 'Port booking confirmed; finance can prepare March billing draft.', '["user-finance-demo"]', '2026-03-15T09:10:00Z', '2026-03-15T09:10:00Z', NULL),
	('pcomment-demo-002', 'proj-demo-005', 'user-finance-demo', 'finance@smartfin.local', 'Finance Reviewer', 'Quarterly milestone revenue is ready for document review.', '["user-pm-demo"]', '2026-04-02T14:35:00Z', '2026-04-02T14:35:00Z', NULL),
	('pcomment-demo-003', 'proj-demo-009', 'user-admin-demo', 'admin@smartfin.local', 'Operations Admin', 'Launch checklist is green except supplier acknowledgement.', '["user-pm-demo"]', '2026-05-18T16:20:00Z', '2026-05-18T16:20:00Z', NULL);

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

UPDATE contracts
SET business_partner_id = (SELECT business_partner_id FROM projects WHERE projects.id = contracts.project_id),
	client_name = (SELECT name FROM business_partners WHERE business_partners.id = (SELECT business_partner_id FROM projects WHERE projects.id = contracts.project_id)),
	contract_number = 'CTR-' || substr(id, 10),
	expiry_date = date(effective_date, '+12 months'),
	scope = 'Regional trade operations and finance settlement support.',
	type = 'customer_contract',
	status = CASE WHEN project_id = 'proj-demo-003' THEN 'completed' ELSE 'active' END,
	payment_terms = 'Net 30',
	notes = 'Mock contract record for local document hub.'
WHERE id LIKE 'ctr-demo-%';

UPDATE quotations
SET business_partner_id = (SELECT business_partner_id FROM projects WHERE projects.id = quotations.project_id),
	client_name = (SELECT name FROM business_partners WHERE business_partners.id = (SELECT business_partner_id FROM projects WHERE projects.id = quotations.project_id)),
	quotation_number = 'QUO-' || substr(id, 10),
	status = CASE WHEN project_id IN ('proj-demo-001', 'proj-demo-005', 'proj-demo-009') THEN 'accepted' ELSE 'sent' END,
	valid_until = date(date, '+45 days'),
	line_items = '[{"description":"Operations service package","quantity":1,"unitPrice":12000},{"description":"Document processing","quantity":1,"unitPrice":2500}]',
	notes = 'Mock quotation with line-item JSON.'
WHERE id LIKE 'quo-demo-%';

UPDATE purchase_orders
SET business_partner_id = 'sup-demo-001',
	client_name = supplier_name,
	status = CASE WHEN id IN ('po-demo-001', 'po-demo-003', 'po-demo-007') THEN 'confirmed' ELSE 'sent' END,
	line_items = '[{"description":"Supplier service package","quantity":1,"unitPrice":15000}]',
	metadata = '{"source":"mock-seed","flow":"legacy_project_document"}',
	description = 'Project supplier purchase order.',
	notes = 'Mock project purchase order for local document hub.'
WHERE id LIKE 'po-demo-%';

INSERT INTO ar_document_links (id, from_type, from_id, to_type, to_id, link_type, created_at, updated_at, deleted_at)
VALUES
	('ardl-demo-001', 'quotation', 'quo-demo-001', 'contract', 'ctr-demo-001', 'quotation_to_contract', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ardl-demo-002', 'contract', 'ctr-demo-001', 'revenue', 'rev-demo-001', 'contract_to_revenue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ardl-demo-003', 'purchase_order', 'po-demo-001', 'expense', 'exp-demo-001', 'po_to_expense', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Procurement RFQ workflow
INSERT INTO procurement_rfqs (id, rfq_number, title, source_type, source_id, project_id, status, currency, required_by_date, created_by_user_id, created_by_email, notes, created_at, updated_at, deleted_at)
VALUES
	('rfq-demo-001', 'RFQ-2026-001', 'Cold Chain Packaging RFQ', 'manual', NULL, 'proj-demo-009', 'sent', 'SGD', '2026-06-15', 'user-pm-demo', 'pm@smartfin.local', 'Q2 launch packaging and cold-chain materials.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfq-demo-002', 'RFQ-2026-002', 'Palm Oil Feedstock Tender', 'manual', NULL, 'proj-demo-001', 'converted', 'SGD', '2026-06-20', 'user-pm-demo', 'pm@smartfin.local', 'Feedstock tender converted to PO.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_rfq_items (id, rfq_id, item_code, description, quantity, uom, target_unit_price, notes, created_at, updated_at, deleted_at)
VALUES
	('rfqi-demo-001', 'rfq-demo-001', 'PKG-DRUM-200L', 'Food-grade export drum 200L', 180, 'unit', 42, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfqi-demo-002', 'rfq-demo-001', 'SVC-COLD-CHAIN', 'Temperature controlled handling service', 1, 'lot', 4500, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfqi-demo-003', 'rfq-demo-002', 'RM-PALM-OIL', 'Crude palm oil feedstock', 24000, 'kg', 1.58, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_rfq_suppliers (id, rfq_id, supplier_id, contact_name, contact_email, status, sent_at, notes, created_at, updated_at, deleted_at)
VALUES
	('rfqs-demo-001', 'rfq-demo-001', 'sup-demo-004', 'Priya Menon', 'priya@jurongcold.local', 'responded', '2026-05-22T10:00:00Z', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfqs-demo-002', 'rfq-demo-001', 'sup-demo-003', 'Daniel Ong', 'daniel@borneo-port.local', 'responded', '2026-05-22T10:05:00Z', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfqs-demo-003', 'rfq-demo-002', 'sup-demo-001', 'Siti Rahman', 'siti@nusantara-agro.local', 'responded', '2026-05-24T09:00:00Z', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rfqs-demo-004', 'rfq-demo-002', 'sup-demo-002', 'Lim Wei Jian', 'lim@klspares.local', 'no_response', '2026-05-24T09:10:00Z', 'No response by cut-off.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_supplier_quotations (
	id, rfq_id, rfq_supplier_id, supplier_id, quotation_number, status, submitted_at,
	currency, lead_time_days, delivery_terms, payment_terms, validity_date,
	shipping_amount, tax_amount, duties_amount, discount_amount, subtotal_amount,
	total_cost, supplier_rating_snapshot, notes, created_at, updated_at, deleted_at
)
VALUES
	('psq-demo-001', 'rfq-demo-001', 'rfqs-demo-001', 'sup-demo-004', 'JCC-Q-2026-144', 'submitted', '2026-05-25T12:10:00Z', 'SGD', 14, 'DDP Singapore', 'Net 30', '2026-06-30', 450, 702, 0, 120, 7800, 8832, 64, 'Cheapest material quote but supplier on hold.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psq-demo-002', 'rfq-demo-001', 'rfqs-demo-002', 'sup-demo-003', 'BPS-Q-2026-081', 'selected', '2026-05-25T15:40:00Z', 'SGD', 7, 'Port-to-warehouse', 'Net 14', '2026-06-25', 900, 0, 120, 0, 8300, 9320, 79, 'Selected for launch reliability.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psq-demo-003', 'rfq-demo-002', 'rfqs-demo-003', 'sup-demo-001', 'NAS-Q-2026-219', 'selected', '2026-05-26T10:30:00Z', 'SGD', 21, 'CIF Singapore', 'Net 30', '2026-06-30', 1500, 3240, 0, 500, 36000, 40240, 87, 'Selected feedstock tender.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_supplier_quotation_items (id, quotation_id, rfq_item_id, quantity, unit_price, line_total, notes, created_at, updated_at, deleted_at)
VALUES
	('psqi-demo-001', 'psq-demo-001', 'rfqi-demo-001', 180, 38, 6840, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psqi-demo-002', 'psq-demo-001', 'rfqi-demo-002', 1, 960, 960, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psqi-demo-003', 'psq-demo-002', 'rfqi-demo-001', 180, 40, 7200, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psqi-demo-004', 'psq-demo-002', 'rfqi-demo-002', 1, 1100, 1100, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('psqi-demo-005', 'psq-demo-003', 'rfqi-demo-003', 24000, 1.50, 36000, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_orders (
	id, po_number, source_type, source_id, rfq_id, quotation_id, supplier_id, project_id,
	status, approval_status, approval_required, approval_threshold_amount, supplier_risk_level,
	approved_by_user_id, approved_by_email, approved_at, rejected_reason, po_date, delivery_date,
	goods_receipt_date, currency, tax_code, incoterms, billing_address, ack_status,
	ack_requested_at, acknowledged_at, supplier_ack_reference, subtotal_amount, shipping_amount,
	tax_amount, duties_amount, total_amount, competitive_quotes_count, after_the_fact_flag,
	ia_exception_code, ia_exception_reason, created_by_user_id, created_by_email, notes,
	created_at, updated_at, deleted_at
)
VALUES
	('prpo-demo-001', 'PR-PO-2026-001', 'rfq', 'rfq-demo-002', 'rfq-demo-002', 'psq-demo-003', 'sup-demo-001', 'proj-demo-001', 'confirmed', 'approved', 1, 25000, 'medium', 'user-owner-demo', 'owner@smartfin.local', '2026-05-27T11:00:00Z', NULL, '2026-05-27', '2026-06-18', NULL, 'SGD', 'SR', 'CIF', '1 Raffles Place, Singapore', 'acknowledged', '2026-05-27T12:00:00Z', '2026-05-28T09:30:00Z', 'NAS-ACK-219', 36000, 1500, 3240, 0, 40240, 2, 0, NULL, NULL, 'user-pm-demo', 'pm@smartfin.local', 'Converted from selected tender.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpo-demo-002', 'PR-PO-2026-002', 'rfq', 'rfq-demo-001', 'rfq-demo-001', 'psq-demo-002', 'sup-demo-003', 'proj-demo-009', 'partially_received', 'approved', 1, 8000, 'medium', 'user-owner-demo', 'owner@smartfin.local', '2026-05-29T10:45:00Z', NULL, '2026-05-29', '2026-06-08', '2026-06-03', 'SGD', 'OP', 'DAP', '80 Robinson Road, Singapore', 'acknowledged', '2026-05-29T12:15:00Z', '2026-05-30T08:40:00Z', 'BPS-ACK-081', 8300, 900, 0, 120, 9320, 2, 0, NULL, NULL, 'user-pm-demo', 'pm@smartfin.local', 'Launch materials partially received.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpo-demo-003', 'PR-PO-2026-003', 'manual', NULL, NULL, NULL, 'sup-demo-004', 'proj-demo-006', 'pending_approval', 'pending_approval', 1, 5000, 'high', NULL, NULL, NULL, NULL, '2026-06-01', '2026-06-20', NULL, 'SGD', 'SR', 'DDP', '10 Anson Road, Singapore', 'not_requested', NULL, NULL, NULL, 6200, 300, 585, 0, 7085, 0, 1, 'IA-ATF-001', 'After-the-fact purchase captured for approval.', 'user-pm-demo', 'pm@smartfin.local', 'Pending approval because supplier is on hold.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_order_items (id, po_id, item_code, description, quantity, received_quantity, back_ordered_quantity, uom, unit_price, line_subtotal, tax_code, delivery_date, notes, created_at, updated_at, deleted_at)
VALUES
	('prpoi-demo-001', 'prpo-demo-001', 'RM-PALM-OIL', 'Crude palm oil feedstock', 24000, 0, 0, 'kg', 1.50, 36000, 'SR', '2026-06-18', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpoi-demo-002', 'prpo-demo-002', 'PKG-DRUM-200L', 'Food-grade export drum 200L', 180, 90, 90, 'unit', 40, 7200, 'OP', '2026-06-08', 'Half shipment received.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpoi-demo-003', 'prpo-demo-002', 'SVC-COLD-CHAIN', 'Temperature controlled handling service', 1, 1, 0, 'lot', 1100, 1100, 'OP', '2026-06-08', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpoi-demo-004', 'prpo-demo-003', 'PKG-DRUM-200L', 'Emergency cold-chain drums', 120, 0, 0, 'unit', 51.67, 6200, 'SR', '2026-06-20', 'After-the-fact request.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_order_receipts (id, po_id, po_item_id, receipt_number, receipt_date, quantity_received, accepted_quantity, rejected_quantity, back_order_quantity, notes, created_at, updated_at, deleted_at)
VALUES
	('prpor-demo-001', 'prpo-demo-002', 'prpoi-demo-002', 'GRN-2026-001', '2026-06-03', 90, 88, 2, 90, 'Two drums dented and quarantined.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prpor-demo-002', 'prpo-demo-002', 'prpoi-demo-003', 'GRN-2026-002', '2026-06-03', 1, 1, 0, 0, 'Service acknowledgement received.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Inventory item master and warehouse stock
INSERT INTO items (
	id, code, name, description, item_type, status, category, uom, uom_category,
	preferred_supplier_id, reorder_point, min_level, max_level, lead_time_days,
	lot_control, serial_control, shelf_life_days, valuation_method, standard_cost,
	last_cost, average_cost, currency, primary_image_url, primary_barcode_value,
	primary_barcode_type, notes, created_at, updated_at, deleted_at
)
VALUES
	('item-demo-001', 'RM-PALM-OIL', 'Crude Palm Oil Feedstock', 'Bulk feedstock for regional import projects.', 'raw_material', 'active', 'Agro Commodity', 'kg', 'weight', 'sup-demo-001', 5000, 3000, 50000, 21, 1, 0, 180, 'weighted_average', 1.50, 1.54, 1.52, 'SGD', 'mock://inventory/items/rm-palm-oil.png', 'INV-RM-PALM-OIL-EACH', 'code128', 'Lot controlled feedstock.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('item-demo-002', 'PKG-DRUM-200L', 'Food Grade Export Drum 200L', 'Reusable export drum for cold-chain and commodity shipments.', 'consumable', 'active', 'Packaging', 'unit', 'count', 'sup-demo-004', 80, 50, 600, 14, 0, 0, NULL, 'standard_cost', 40, 42, 41, 'SGD', 'mock://inventory/items/export-drum.png', 'INV-PKG-DRUM-200L-EACH', 'code128', 'Primary cold-chain packaging item.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('item-demo-003', 'FG-EXPORT-BUNDLE', 'Re-export Documentation Bundle', 'Finished document bundle used for customer handover.', 'finished_good', 'active', 'Documentation', 'set', 'count', NULL, 15, 10, 100, 3, 0, 1, NULL, 'standard_cost', 18, 20, 19, 'SGD', NULL, 'INV-FG-EXPORT-BUNDLE-EACH', 'code128', 'Serial controlled document bundle.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('item-demo-004', 'SVC-COLD-CHAIN', 'Cold Chain Handling Service', 'Non-stock procurement service item.', 'service', 'active', 'Logistics Service', 'lot', 'service', 'sup-demo-003', NULL, NULL, NULL, 7, 0, 0, NULL, 'weighted_average', NULL, 1100, 1080, 'SGD', NULL, 'INV-SVC-COLD-CHAIN-LOT', 'code128', 'Service item for procurement comparisons.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_item_barcodes (id, item_id, barcode_value, barcode_type, packaging_level, is_primary, notes, created_at, updated_at, deleted_at)
VALUES
	('ibar-demo-001', 'item-demo-001', 'INV-RM-PALM-OIL-EACH', 'code128', 'each', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ibar-demo-002', 'item-demo-001', 'INV-RM-PALM-OIL-PALLET', 'code128', 'pallet', 0, 'Pallet label for bulk receiving.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ibar-demo-003', 'item-demo-002', 'INV-PKG-DRUM-200L-EACH', 'code128', 'each', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ibar-demo-004', 'item-demo-003', 'INV-FG-EXPORT-BUNDLE-EACH', 'code128', 'each', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ibar-demo-005', 'item-demo-004', 'INV-SVC-COLD-CHAIN-LOT', 'code128', 'each', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_item_attachments (id, item_id, attachment_type, title, file_name, file_url, mime_type, is_primary_image, notes, created_at, updated_at, deleted_at)
VALUES
	('iatt-demo-001', 'item-demo-001', 'certificate', 'Feedstock COA Sample', 'palm-oil-coa.pdf', 'mock://inventory/items/rm-palm-oil/coa.pdf', 'application/pdf', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('iatt-demo-002', 'item-demo-002', 'datasheet', 'Drum Specification Sheet', 'export-drum-spec.pdf', 'mock://inventory/items/pkg-drum/spec.pdf', 'application/pdf', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('iatt-demo-003', 'item-demo-002', 'image', 'Drum Product Image', 'export-drum.png', 'mock://inventory/items/pkg-drum/image.png', 'image/png', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO warehouses (id, code, name, status, address_line1, address_line2, city, state, postal_code, country, contact_name, contact_phone, contact_email, notes, created_at, updated_at, deleted_at)
VALUES
	('wh-demo-001', 'WH-TUAS', 'Tuas Main Distribution Centre', 'active', '18 Tuas South Avenue 5', NULL, 'Singapore', NULL, '637789', 'Singapore', 'Maya Koh', '+65 6123 7788', 'warehouse@smartfin.local', 'Primary storage and pick/pack site.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('wh-demo-002', 'WH-CHANGI', 'Changi Transit Hub', 'active', '5 Changi North Way', 'Unit 02-01', 'Singapore', NULL, '498770', 'Singapore', 'Ken Lim', '+65 6444 8800', 'transit@smartfin.local', 'Transit and staging hub.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO warehouse_bin_locations (
	id, warehouse_id, code, name, location_type, aisle, rack, shelf, bin,
	barcode, is_pickable, is_receivable, is_default_putaway, status, notes,
	created_at, updated_at, deleted_at
)
VALUES
	('bin-demo-001', 'wh-demo-001', 'RM-A1-01', 'Raw Material A1-01', 'raw_material', 'A', '1', '01', '01', 'BIN-WH-TUAS-RM-A1-01', 1, 1, 1, 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('bin-demo-002', 'wh-demo-001', 'PKG-B2-05', 'Packaging B2-05', 'picking', 'B', '2', '05', '02', 'BIN-WH-TUAS-PKG-B2-05', 1, 1, 0, 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('bin-demo-003', 'wh-demo-001', 'QC-Q1-01', 'Quality Hold Q1-01', 'quarantine', 'Q', '1', '01', '01', 'BIN-WH-TUAS-QC-Q1-01', 0, 1, 0, 'active', 'Rejected goods and inspection hold.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('bin-demo-004', 'wh-demo-002', 'STG-C1-01', 'Transit Staging C1-01', 'staging', 'C', '1', '01', '01', 'BIN-WH-CHANGI-STG-C1-01', 1, 1, 1, 'active', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('bin-demo-005', 'wh-demo-002', 'COLD-01', 'Cold Room 01', 'finished_goods', 'D', '1', '01', '01', 'BIN-WH-CHANGI-COLD-01', 1, 1, 0, 'active', 'Temperature controlled bin.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_stock_levels (id, item_id, warehouse_id, bin_location_id, quantity_on_hand, quantity_reserved, quantity_incoming, unit_cost, last_movement_at, created_at, updated_at, deleted_at)
VALUES
	('isl-demo-001', 'item-demo-001', 'wh-demo-001', 'bin-demo-001', 18500, 2400, 24000, 1.52, '2026-06-01T09:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('isl-demo-002', 'item-demo-002', 'wh-demo-001', 'bin-demo-002', 320, 90, 120, 41, '2026-06-03T11:20:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('isl-demo-003', 'item-demo-002', 'wh-demo-001', 'bin-demo-003', 2, 0, 0, 41, '2026-06-03T11:30:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('isl-demo-004', 'item-demo-003', 'wh-demo-002', 'bin-demo-004', 36, 8, 0, 19, '2026-05-30T15:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('isl-demo-005', 'item-demo-001', 'wh-demo-002', 'bin-demo-005', 4200, 0, 0, 1.53, '2026-05-28T10:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_stock_movements (
	id, item_id, warehouse_id, bin_location_id, movement_type, reason_code,
	quantity_delta, quantity_after, unit_cost, value_delta, reference_type,
	reference_id, physical_count_document_ref, ia_alert_code, performed_by_user_id,
	performed_by_email, notes, created_at, updated_at
)
VALUES
	('ism-demo-001', 'item-demo-001', 'wh-demo-001', 'bin-demo-001', 'opening_balance', 'OPENING', 18500, 18500, 1.52, 28120, 'seed', 'local-mock-full', NULL, NULL, 'user-admin-demo', 'admin@smartfin.local', 'Opening stock for local demo.', '2026-06-01T09:00:00Z', '2026-06-01T09:00:00Z'),
	('ism-demo-002', 'item-demo-002', 'wh-demo-001', 'bin-demo-002', 'receipt', 'GRN', 90, 320, 41, 3690, 'procurement_receipt', 'prpor-demo-001', NULL, NULL, 'user-admin-demo', 'admin@smartfin.local', 'Partial receipt from procurement PO.', '2026-06-03T11:20:00Z', '2026-06-03T11:20:00Z'),
	('ism-demo-003', 'item-demo-002', 'wh-demo-001', 'bin-demo-003', 'adjustment', 'QC_REJECT', 2, 2, 41, 82, 'procurement_receipt', 'prpor-demo-001', NULL, 'IA-QC-REJECT', 'user-admin-demo', 'admin@smartfin.local', 'Rejected drums moved to quality hold.', '2026-06-03T11:30:00Z', '2026-06-03T11:30:00Z'),
	('ism-demo-004', 'item-demo-003', 'wh-demo-002', 'bin-demo-004', 'issue', 'PROJECT_USE', -8, 36, 19, -152, 'project', 'proj-demo-009', NULL, NULL, 'user-staff-demo', 'staff@smartfin.local', 'Issued for launch document packs.', '2026-05-30T15:00:00Z', '2026-05-30T15:00:00Z');

INSERT INTO inventory_stock_transfers (id, transfer_number, status, source_warehouse_id, dest_warehouse_id, requested_at, shipped_at, received_at, performed_by_user_id, performed_by_email, notes, created_at, updated_at, deleted_at)
VALUES
	('ist-demo-001', 'TRF-2026-001', 'in_transit', 'wh-demo-001', 'wh-demo-002', '2026-06-02T09:00:00Z', '2026-06-03T08:30:00Z', NULL, 'user-admin-demo', 'admin@smartfin.local', 'Drums moving to transit hub for launch.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ist-demo-002', 'TRF-2026-002', 'completed', 'wh-demo-002', 'wh-demo-001', '2026-05-26T10:00:00Z', '2026-05-26T14:00:00Z', '2026-05-27T09:00:00Z', 'user-admin-demo', 'admin@smartfin.local', 'Returned unused document bundles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_stock_transfer_lines (id, transfer_id, item_id, source_bin_id, dest_bin_id, quantity_requested, quantity_shipped, quantity_received, notes, created_at, updated_at, deleted_at)
VALUES
	('istl-demo-001', 'ist-demo-001', 'item-demo-002', 'bin-demo-002', 'bin-demo-004', 120, 120, 0, 'Awaiting receipt at Changi.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('istl-demo-002', 'ist-demo-002', 'item-demo-003', 'bin-demo-004', 'bin-demo-002', 12, 12, 12, 'Completed return transfer.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_cycle_counts (id, count_number, warehouse_id, status, count_type, scheduled_at, counted_at, posted_at, performed_by_user_id, performed_by_email, approved_by_user_id, approved_by_email, document_ref, notes, created_at, updated_at, deleted_at)
VALUES
	('icc-demo-001', 'CC-2026-001', 'wh-demo-001', 'counting', 'cycle_count', '2026-06-04T09:00:00Z', NULL, NULL, 'user-staff-demo', 'staff@smartfin.local', NULL, NULL, 'mock://inventory/cycle-counts/cc-2026-001.pdf', 'Open count for packaging aisle.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('icc-demo-002', 'CC-2026-002', 'wh-demo-002', 'posted', 'cycle_count', '2026-05-28T09:00:00Z', '2026-05-28T11:30:00Z', '2026-05-28T15:00:00Z', 'user-staff-demo', 'staff@smartfin.local', 'user-admin-demo', 'admin@smartfin.local', 'mock://inventory/cycle-counts/cc-2026-002.pdf', 'Posted count with no material variance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_cycle_count_lines (id, cycle_count_id, item_id, bin_location_id, expected_quantity, counted_quantity, variance, unit_cost, variance_value, movement_id, notes, created_at, updated_at, deleted_at)
VALUES
	('iccl-demo-001', 'icc-demo-001', 'item-demo-002', 'bin-demo-002', 320, NULL, NULL, 41, NULL, NULL, 'Counting in progress.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('iccl-demo-002', 'icc-demo-001', 'item-demo-002', 'bin-demo-003', 2, NULL, NULL, 41, NULL, NULL, 'Quality hold line.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('iccl-demo-003', 'icc-demo-002', 'item-demo-003', 'bin-demo-004', 36, 36, 0, 19, 0, NULL, 'No variance.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);


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

INSERT INTO person_roles (id, person_id, role_type, entity_id, valid_from, valid_to, created_at, updated_at, deleted_at)
VALUES
	('prole-demo-001', 'emp-demo-001', 'employee', NULL, '2025-08-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prole-demo-002', 'emp-demo-002', 'employee', NULL, '2025-11-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prole-demo-003', 'emp-demo-003', 'freelancer', NULL, '2026-01-10', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('prole-demo-004', 'emp-demo-003', 'advisor', 'proj-demo-007', '2026-01-10', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO freelancer_profiles (id, person_id, rate_type, rate_amount, currency, payment_terms, business_name, created_at, updated_at, deleted_at)
VALUES
	('frp-demo-001', 'emp-demo-003', 'daily', 450, 'SGD', 'Pay on approved milestone', 'Wang Trade Advisory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO user_person_links (id, user_id, person_id, status, created_at, updated_at, deleted_at)
VALUES
	('upl-demo-001', 'user-staff-demo', 'emp-demo-001', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('upl-demo-002', 'user-hr-demo', 'emp-demo-002', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('upl-demo-003', 'user-pm-demo', 'emp-demo-003', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_types (id, code, name, description, is_paid, requires_document, requires_approval, affects_payroll, status, created_at, updated_at, deleted_at)
VALUES
	('lt-annual', 'ANNUAL', 'Annual Leave', 'Standard paid annual leave entitlement.', 1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-sick', 'SICK', 'Sick Leave', 'Leave for illness or medical appointments.', 1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-hosp', 'HOSP', 'Hospitalisation Leave', 'Extended sick leave requiring documents.', 1, 1, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lt-unpaid', 'UNPAID', 'Unpaid Leave', 'Leave without pay.', 0, 0, 1, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_requests (
	id, person_id, leave_type_id, start_date, end_date, total_days, status,
	reason, source, submitted_at, approved_by_user_id, approved_at,
	rejected_by_user_id, rejected_at, rejection_reason, payroll_effect,
	created_at, updated_at, deleted_at
)
VALUES
	('lr-demo-001', 'emp-demo-001', 'lt-annual', '2026-06-05', '2026-06-05', 1, 'approved', 'Family appointment', 'mock', '2026-05-30T09:00:00Z', 'user-hr-demo', '2026-05-30T11:00:00Z', NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lr-demo-002', 'emp-demo-001', 'lt-annual', '2026-07-06', '2026-07-08', 3, 'pending', 'School holiday travel', 'mock', '2026-06-01T10:00:00Z', NULL, NULL, NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lr-demo-003', 'emp-demo-002', 'lt-sick', '2026-06-03', '2026-06-03', 1, 'approved', 'Medical leave', 'mock', '2026-06-03T08:30:00Z', 'user-hr-demo', '2026-06-03T09:10:00Z', NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lr-demo-004', 'emp-demo-002', 'lt-unpaid', '2026-08-10', '2026-08-12', 3, 'pending', 'Personal matters', 'mock', '2026-06-02T13:00:00Z', NULL, NULL, NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lr-demo-005', 'emp-demo-003', 'lt-hosp', '2026-07-20', '2026-07-24', 5, 'pending', 'Scheduled procedure', 'mock', '2026-06-02T15:20:00Z', NULL, NULL, NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lr-demo-006', 'emp-demo-003', 'lt-annual', '2026-05-04', '2026-05-06', 3, 'rejected', 'Short trip', 'mock', '2026-04-22T09:00:00Z', NULL, NULL, 'user-hr-demo', '2026-04-23T10:00:00Z', 'Project support required during close.', 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_balances (id, person_id, leave_type_id, year, entitled_days, used_days, pending_days, created_at, updated_at, deleted_at)
VALUES
	('lb-demo-001', 'emp-demo-001', 'lt-annual', 2026, 14, 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-002', 'emp-demo-001', 'lt-sick', 2026, 14, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-003', 'emp-demo-002', 'lt-annual', 2026, 10, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-004', 'emp-demo-002', 'lt-sick', 2026, 14, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-005', 'emp-demo-002', 'lt-unpaid', 2026, 0, 0, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-006', 'emp-demo-003', 'lt-annual', 2026, 8, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lb-demo-007', 'emp-demo-003', 'lt-hosp', 2026, 60, 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_approval_records (id, leave_request_id, action, actor_id, actor_name, from_status, to_status, comment, created_at, updated_at, deleted_at)
VALUES
	('lar-demo-001', 'lr-demo-001', 'approved', 'user-hr-demo', 'hr@smartfin.local', 'pending', 'approved', 'Approved for one-day appointment.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lar-demo-002', 'lr-demo-003', 'approved', 'user-hr-demo', 'hr@smartfin.local', 'pending', 'approved', 'Medical leave approved.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('lar-demo-003', 'lr-demo-006', 'rejected', 'user-hr-demo', 'hr@smartfin.local', 'pending', 'rejected', 'Project support required during close.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO attendance_records (
	id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
	late_minutes, early_leave_minutes, overtime_minutes, status, source,
	payroll_effect, notes, created_at, updated_at, deleted_at
)
VALUES
	('ar-demo-e1-20260601', 'emp-demo-001', '2026-06-01', '09:00', '18:00', 540, 0, 0, 0, 'present', 'mock', 'not_applicable', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260602', 'emp-demo-001', '2026-06-02', '09:00', '20:00', 660, 0, 0, 120, 'present', 'mock', 'not_applicable', 'Project deadline overtime.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260603', 'emp-demo-001', '2026-06-03', '09:35', '18:00', 505, 35, 0, 0, 'late', 'mock', 'pending_review', 'Traffic delay.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260604', 'emp-demo-001', '2026-06-04', '09:00', '18:45', 585, 0, 0, 45, 'present', 'mock', 'not_applicable', 'Candidate overtime without request.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260605', 'emp-demo-001', '2026-06-05', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'Annual leave.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260606', 'emp-demo-001', '2026-06-06', NULL, NULL, NULL, 0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e1-20260607', 'emp-demo-001', '2026-06-07', NULL, NULL, NULL, 0, 0, 0, 'rest_day', 'mock', 'not_applicable', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e2-20260601', 'emp-demo-002', '2026-06-01', '09:00', '19:00', 600, 0, 0, 60, 'present', 'mock', 'not_applicable', 'Month-end support.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e2-20260602', 'emp-demo-002', '2026-06-02', '09:00', NULL, NULL, 0, 0, 0, 'missing_checkout', 'mock', 'pending_review', 'Missing checkout for HR review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e2-20260603', 'emp-demo-002', '2026-06-03', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'mock', 'not_applicable', 'Sick leave.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e2-20260604', 'emp-demo-002', '2026-06-04', '09:00', '18:00', 540, 0, 0, 0, 'present', 'mock', 'not_applicable', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e2-20260605', 'emp-demo-002', '2026-06-05', NULL, NULL, NULL, 0, 0, 0, 'absent', 'mock', 'pending_review', 'No-show pending review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e3-20260601', 'emp-demo-003', '2026-06-01', '10:00', '18:00', 480, 0, 0, 0, 'present', 'mock', 'not_applicable', 'Freelancer onsite day.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e3-20260602', 'emp-demo-003', '2026-06-02', '10:00', '21:30', 690, 0, 0, 90, 'present', 'mock', 'not_applicable', 'Evening advisory support.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ar-demo-e3-20260603', 'emp-demo-003', '2026-06-03', '10:15', '18:00', 465, 15, 0, 0, 'late', 'mock', 'pending_review', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO overtime_requests (
	id, person_id, attendance_record_id, work_date, overtime_minutes, reason,
	status, source, approved_by_user_id, approved_at, rejected_by_user_id,
	rejected_at, rejection_reason, payroll_effect, notes, created_at, updated_at, deleted_at
)
VALUES
	('ot-demo-001', 'emp-demo-001', 'ar-demo-e1-20260602', '2026-06-02', 120, 'Customs deadline support', 'approved', 'attendance_detected', 'user-hr-demo', '2026-06-03T09:00:00Z', NULL, NULL, NULL, 'pending_export', 'Approved overtime for payroll export.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ot-demo-002', 'emp-demo-002', 'ar-demo-e2-20260601', '2026-06-01', 60, 'Month-end reconciliation', 'pending', 'attendance_detected', NULL, NULL, NULL, NULL, NULL, 'not_applicable', 'Awaiting HR approval.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ot-demo-003', 'emp-demo-003', 'ar-demo-e3-20260602', '2026-06-02', 90, 'Evening advisory support', 'rejected', 'attendance_detected', NULL, NULL, 'user-hr-demo', '2026-06-03T10:30:00Z', 'Covered by advisory day rate.', 'not_applicable', 'Rejected because day rate already covers support.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO overtime_approval_records (id, overtime_request_id, action, actor_id, actor_name, from_status, to_status, comment, created_at, updated_at, deleted_at)
VALUES
	('otar-demo-001', 'ot-demo-001', 'approved', 'user-hr-demo', 'hr@smartfin.local', 'pending', 'approved', 'Approved for payroll export.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('otar-demo-002', 'ot-demo-003', 'rejected', 'user-hr-demo', 'hr@smartfin.local', 'pending', 'rejected', 'Covered by advisory day rate.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_compensation_components (id, employee_id, label, income_type, rule_type, value, floor, cap, frequency, taxable, effective_from, effective_to, created_at, updated_at, deleted_at)
VALUES
	('ecc-demo-001', 'emp-demo-001', 'Base Salary', 'salary', 'fixed', 5200, NULL, NULL, 'monthly', 1, '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('ecc-demo-002', 'emp-demo-001', 'Transport Allowance', 'allowance', 'fixed', 200, NULL, NULL, 'monthly', 1, '2026-01-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

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

UPDATE expenses
SET doc_type = 'invoice',
	sgd_equivalent = amount,
	gst_amount = round(amount * 0.09, 2),
	gst_code = 'SR',
	vendor_or_supplier = CASE
		WHEN id IN ('exp-demo-001', 'exp-demo-005', 'exp-demo-007') THEN 'Nusantara Agro Supply Pte Ltd'
		WHEN id IN ('exp-demo-002', 'exp-demo-004') THEN 'Jurong Cold Chain Components'
		ELSE 'Borneo Port Services'
	END,
	reimbursement = CASE WHEN id IN ('exp-demo-003', 'exp-demo-006') THEN 1 ELSE 0 END,
	business_trip = CASE WHEN id IN ('exp-demo-003', 'exp-demo-006') THEN 1 ELSE 0 END,
	destination = CASE WHEN id = 'exp-demo-003' THEN 'Ho Chi Minh City' WHEN id = 'exp-demo-006' THEN 'Kuching' ELSE NULL END,
	notes = 'Mock expense enriched for local dashboards and reimbursement views.'
WHERE id LIKE 'exp-demo-%';

INSERT INTO expenses (
	id, project_id, expense_type, category, doc_type, date, amount, currency,
	sgd_equivalent, gst_amount, gst_code, vendor_or_supplier, staff_name,
	reimbursement, business_trip, destination, document_ref, metadata, notes,
	created_at, updated_at, deleted_at
)
VALUES
	('exp-demo-008', 'proj-demo-001', 'sales_cost', 'Logistics', 'receipt', '2026-06-01', 640, 'SGD', 640, 57.6, 'SR', 'Borneo Port Services', 'Alice Tan', 1, 1, 'Jakarta', 'mock://expenses/exp-demo-008.pdf', '{"channel":"mock-seed","subcategory":"Taxi and meals"}', 'Reimbursement sample pending finance review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('exp-demo-009', NULL, 'opex', 'Travel', 'receipt', '2026-06-02', 215, 'SGD', 215, 19.35, 'SR', 'ComfortDelGro', 'Rahim Iskandar', 1, 0, NULL, 'mock://expenses/exp-demo-009.pdf', '{"channel":"mock-seed","subcategory":"Local transport"}', 'Company-level reimbursement sample.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO revenue (
	id, invoice_type, invoice_number, client_name, project_id, date, amount,
	currency, sgd_equivalent, gst_amount, gst_code, document_ref, metadata,
	notes, created_at, updated_at, deleted_at
)
VALUES
	('rev-demo-001', 'tax_invoice', 'INV-2026-001', 'Demo Trading Pte Ltd', 'proj-demo-001', '2026-03-31', 58000, 'SGD', 58000, 5220, 'SR', 'mock://revenue/rev-demo-001.pdf', '{"channel":"mock-seed","billingPeriod":"2026-03"}', 'March import service billing.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rev-demo-002', 'standard', 'INV-2026-002', 'Lion City Imports', 'proj-demo-002', '2026-04-10', 24000, 'SGD', 24000, 2160, 'SR', 'mock://revenue/rev-demo-002.pdf', '{"channel":"mock-seed","billingPeriod":"2026-04"}', 'Spare parts consolidation milestone.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rev-demo-003', 'zero_rate', 'INV-2026-003', 'Harbourline Logistics', 'proj-demo-003', '2026-02-28', 42000, 'SGD', 42000, 0, 'ZR', 'mock://revenue/rev-demo-003.pdf', '{"channel":"mock-seed","exportService":true}', 'Zero-rated export support.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rev-demo-004', 'standard', 'INV-2026-004', 'Lion City Imports', 'proj-demo-005', '2026-05-15', 36500, 'SGD', 36500, 3285, 'SR', 'mock://revenue/rev-demo-004.pdf', '{"channel":"mock-seed","billingPeriod":"2026-Q2"}', 'Vietnam expansion milestone.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('rev-demo-005', 'out_of_scope', 'INV-2026-005', 'Demo Trading Pte Ltd', 'proj-demo-007', '2026-01-20', 18800, 'USD', 25200, 0, 'OP', 'mock://revenue/rev-demo-005.pdf', '{"channel":"mock-seed","fx":"USD-SGD 1.34"}', 'Out-of-scope overseas customer billing sample.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO business_trips (id, employee_id, project_id, destination, start_date, end_date, days, daily_allowance_rate, status, notes, created_at, updated_at, deleted_at)
VALUES
	('bt-demo-001', 'emp-demo-001', 'proj-demo-001', 'Jakarta', '2026-06-01', '2026-06-03', 3, 120, 'pending_reimbursement', 'Customer site and port visit.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('bt-demo-002', 'emp-demo-002', 'proj-demo-006', 'Manila', '2026-05-12', '2026-05-14', 3, 110, 'closed', 'Cold-room vendor review.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO documents (
	id, project_id, uploaded_by, entity_type, entity_id, file_key, file_name,
	file_type, purpose, doc_type, ocr_status, ocr_result, ocr_confidence,
	notes, created_at, updated_at, deleted_at
)
VALUES
	('doc-demo-001', 'proj-demo-001', 'user-finance-demo', 'expense', 'exp-demo-001', 'mock/expenses/exp-demo-001.pdf', 'exp-demo-001.pdf', 'application/pdf', 'financial', 'invoice', 'done', '{"supplier":"Nusantara Agro Supply Pte Ltd","amount":3200}', 0.94, 'OCR-complete supplier invoice sample.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('doc-demo-002', 'proj-demo-001', 'user-finance-demo', 'revenue', 'rev-demo-001', 'mock/revenue/rev-demo-001.pdf', 'rev-demo-001.pdf', 'application/pdf', 'financial', 'invoice', 'done', '{"customer":"Demo Trading Pte Ltd","amount":58000}', 0.96, 'Revenue invoice sample.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('doc-demo-003', 'proj-demo-009', 'user-pm-demo', 'purchase_order', 'po-demo-007', 'mock/po/po-demo-007.pdf', 'po-demo-007.pdf', 'application/pdf', 'financial', 'po', 'processing', NULL, NULL, 'Processing PO sample.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO document_artifacts (
	id, tenant_id, source, processing_status, document_type, original_file,
	source_metadata, text_extraction, classification, suggested_fields,
	suggested_category_id, normalized_metadata, security_flags, size_bytes,
	created_at, updated_at, deleted_at
)
VALUES
	('artifact-demo-001', 'default', 'manual_upload', 'ready_for_review', 'supplier_invoice', '{"fileName":"nusantara-port-handling.pdf","mimeType":"application/pdf","sizeBytes":184220,"storageKey":"mock/artifacts/nusantara-port-handling.pdf"}', '{"uploadedBy":"finance@smartfin.local","channel":"mock-seed"}', '{"plainText":"Invoice for port handling SGD 3200","confidence":0.94}', '{"documentType":"supplier_invoice","confidence":0.92}', '{"fields":{"supplierName":"Nusantara Agro Supply Pte Ltd","amount":3200,"currency":"SGD","invoiceDate":"2026-03-08"},"confidence":{"amount":0.98,"supplierName":0.93}}', 'expense.logistics', '{"projectId":"proj-demo-001","reviewQueue":"finance"}', '[]', 184220, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('artifact-demo-002', 'default', 'email_attachment', 'classified', 'purchase_order', '{"fileName":"po-demo-007.pdf","mimeType":"application/pdf","sizeBytes":93210,"storageKey":"mock/artifacts/po-demo-007.pdf"}', '{"from":"ops@lioncity-imports.sg","subject":"PO for Q2 launch"}', '{"plainText":"Purchase order PO-2026-041","confidence":0.88}', '{"documentType":"purchase_order","confidence":0.87}', NULL, NULL, '{"projectId":"proj-demo-009"}', '[]', 93210, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('artifact-demo-003', 'default', 'mobile_scan', 'needs_manual_review', 'receipt', '{"fileName":"taxi-receipt-jakarta.jpg","mimeType":"image/jpeg","sizeBytes":248900,"storageKey":"mock/artifacts/taxi-receipt-jakarta.jpg"}', '{"uploadedBy":"staff@smartfin.local","device":"mobile"}', '{"plainText":"Taxi receipt Jakarta SGD 64","confidence":0.72}', '{"documentType":"receipt","confidence":0.74}', '{"fields":{"amount":64,"currency":"SGD","merchant":"Jakarta Taxi"},"confidence":{"amount":0.74}}', 'expense.travel', '{"projectId":"proj-demo-001","requiresHumanReview":true}', '[{"type":"low_confidence","severity":"medium"}]', 248900, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO person_income (
	id, person_id, source, source_id, role_type, income_type, amount,
	taxable_amount, currency, period, project_id, year_of_assessment,
	tax_treatment, created_at, updated_at, deleted_at
)
VALUES
	('pi-demo-001', 'emp-demo-001', 'payout', 'pay-demo-001', 'employee', 'bonus', 2400, 2400, 'SGD', '2026-03', 'proj-demo-001', '2027', 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pi-demo-002', 'emp-demo-001', 'external', 'sal-demo-001', 'employee', 'salary', 6800, 6800, 'SGD', '2026-03', NULL, '2027', 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pi-demo-003', 'emp-demo-002', 'payout', 'pay-demo-003', 'employee', 'bonus', 850, 850, 'SGD', '2026-03', 'proj-demo-002', '2027', 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pi-demo-004', 'emp-demo-003', 'payout', 'pay-demo-006', 'freelancer', 'advisory_fee', 990, 990, 'SGD', '2025-12', 'proj-demo-007', '2026', 'withholding', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('pi-demo-005', 'emp-demo-001', 'reimbursement', 'exp-demo-008', 'employee', 'reimbursement', 640, 0, 'SGD', '2026-06', 'proj-demo-001', '2027', 'exempt', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO time_logs (id, person_id, project_id, date, hours, description, billable, created_at, updated_at, deleted_at)
VALUES
	('tl-demo-001', 'emp-demo-001', 'proj-demo-001', '2026-06-01', 7.5, 'Port coordination and customer updates.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('tl-demo-002', 'emp-demo-001', 'proj-demo-001', '2026-06-02', 10, 'Customs deadline support.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('tl-demo-003', 'emp-demo-002', 'proj-demo-002', '2026-06-01', 6, 'Supplier reconciliation.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('tl-demo-004', 'emp-demo-003', 'proj-demo-007', '2026-06-02', 9.5, 'Commodity risk advisory.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Tax settings and sample GST return
INSERT INTO company_settings (key, value, created_at, updated_at, deleted_at)
VALUES
	('modules.enabled', '["core","sales-crm","project","finance","document-intake","hr","procurement","inventory"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
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
