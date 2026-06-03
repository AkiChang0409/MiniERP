-- Remote-safe business mock data for SmartFin.
-- This seed only touches rows with the `mock-remote-*` prefix and does not
-- delete auth users/accounts/sessions. Apply migrations before running it:
--   npm run db:migrate:remote
--   wrangler d1 execute smartfin-db-v4 --remote --file drizzle/seeds/remote-business-mock.sql

-- Clean previous remote mock rows in dependency order.
DELETE FROM audit_logs WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_purchase_order_receipts WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_purchase_order_items WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_purchase_orders WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_supplier_quotation_items WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_supplier_quotations WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_rfq_suppliers WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_rfq_items WHERE id LIKE 'mock-remote-%';
DELETE FROM procurement_rfqs WHERE id LIKE 'mock-remote-%';
DELETE FROM inventory_stock_movements WHERE id LIKE 'mock-remote-%';
DELETE FROM inventory_stock_levels WHERE id LIKE 'mock-remote-%';
DELETE FROM warehouse_bin_locations WHERE id LIKE 'mock-remote-%';
DELETE FROM warehouses WHERE id LIKE 'mock-remote-%';
DELETE FROM items WHERE id LIKE 'mock-remote-%';
DELETE FROM payout_records WHERE id LIKE 'mock-remote-%';
DELETE FROM compensation_components WHERE id LIKE 'mock-remote-%';
DELETE FROM employee_salaries WHERE id LIKE 'mock-remote-%';
DELETE FROM employee_project_allocations WHERE id LIKE 'mock-remote-%';
DELETE FROM project_employees WHERE id LIKE 'mock-remote-%';
DELETE FROM overtime_approval_records WHERE id LIKE 'mock-remote-%';
DELETE FROM overtime_requests WHERE id LIKE 'mock-remote-%';
DELETE FROM attendance_records WHERE id LIKE 'mock-remote-%';
DELETE FROM leave_approval_records WHERE id LIKE 'mock-remote-%';
DELETE FROM leave_requests WHERE id LIKE 'mock-remote-%';
DELETE FROM leave_balances WHERE id LIKE 'mock-remote-%';
DELETE FROM leave_types WHERE id LIKE 'mock-remote-%';
DELETE FROM employee_profiles WHERE id LIKE 'mock-remote-%';
DELETE FROM persons WHERE id LIKE 'mock-remote-%';
DELETE FROM expenses WHERE id LIKE 'mock-remote-%';
DELETE FROM revenue WHERE id LIKE 'mock-remote-%';
DELETE FROM gst_returns WHERE id LIKE 'mock-remote-%';
DELETE FROM company_settings WHERE key LIKE 'mock_remote_%';
DELETE FROM expense_categories WHERE id LIKE 'mock-remote-%';
DELETE FROM purchase_orders WHERE id LIKE 'mock-remote-%';
DELETE FROM quotations WHERE id LIKE 'mock-remote-%';
DELETE FROM contracts WHERE id LIKE 'mock-remote-%';
DELETE FROM projects WHERE id LIKE 'mock-remote-%';
DELETE FROM partner_supplier_evaluations WHERE id LIKE 'mock-remote-%';
DELETE FROM partner_supplier_profiles WHERE id LIKE 'mock-remote-%';
DELETE FROM partner_contacts WHERE id LIKE 'mock-remote-%';
DELETE FROM partner_customer_profiles WHERE id LIKE 'mock-remote-%';
DELETE FROM business_partners WHERE id LIKE 'mock-remote-%';

-- Sales CRM: customers.
INSERT INTO business_partners (
	id, name, type, registration_no, country, address, contact, currency, gst_reg_no, metadata,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-cust-001', 'Northstar Retail Pte Ltd', 'customer', '202612345M', 'Singapore', '8 Marina View, Singapore', 'ap@northstar-retail.sg', 'SGD', 'M2-0001234-5', '{"source":"remote-business-mock","tier":"gold"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cust-002', 'Straits Food Services Pte Ltd', 'customer', '202645678K', 'Singapore', '12 Tampines Industrial Ave 5, Singapore', 'finance@straitsfood.sg', 'SGD', 'M2-0004567-8', '{"source":"remote-business-mock","tier":"silver"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cust-003', 'Merlion Project Advisory Pte Ltd', 'customer', '202698765R', 'Singapore', '30 Cecil Street, Singapore', 'ops@merlion-advisory.sg', 'SGD', NULL, '{"source":"remote-business-mock","tier":"bronze"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_customer_profiles (
	id, partner_id, credit_limit, billing_terms, customer_tier, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-cprof-001', 'mock-remote-cust-001', '120000', '30 days', 'gold', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cprof-002', 'mock-remote-cust-002', '80000', '45 days', 'silver', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cprof-003', 'mock-remote-cust-003', '50000', '14 days', 'bronze', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Procurement: suppliers and profile data.
INSERT INTO business_partners (
	id, name, type, registration_no, country, address, contact, currency, gst_reg_no, metadata,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-supp-001', 'Pacific Components Pte Ltd', 'supplier', '201912345N', 'Singapore', '21 Tuas South Ave 6, Singapore', 'sales@pacific-components.sg', 'SGD', 'M9-1112223-4', '{"source":"remote-business-mock","category":"components"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-supp-002', 'Johor Packaging Sdn Bhd', 'supplier', 'MY-88442211', 'Malaysia', 'Lot 18 Jalan Kempas, Johor Bahru', 'orders@jb-packaging.my', 'MYR', NULL, '{"source":"remote-business-mock","category":"packaging"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_contacts (
	id, partner_id, name, phone_email, wechat, position, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-contact-001', 'mock-remote-supp-001', 'Irene Lim', 'irene@pacific-components.sg / +65 6123 4567', NULL, 'Account Manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-contact-002', 'mock-remote-supp-002', 'Ahmad Rahman', 'ahmad@jb-packaging.my / +60 7 555 0188', NULL, 'Sales Lead', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_profiles (
	id, partner_id, payment_terms, preferred_currency, supplier_category,
	supplier_type, supplier_status, acra_uen, business_registration_no,
	gst_registration_status, tax_code, billing_address, shipping_address,
	bank_name, bank_account_no, swift_code, credit_terms, inspection_required,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-sprof-001', 'mock-remote-supp-001', '30 days', 'SGD', 'Electronics',
	 'corporate_local', 'preferred', '201912345N', '201912345N',
	 'registered', 'SR', '21 Tuas South Ave 6, Singapore', '21 Tuas South Ave 6, Singapore',
	 'DBS Bank', '001-234567-8', 'DBSSSGSG', 'Net 30', 1,
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-sprof-002', 'mock-remote-supp-002', '45 days', 'MYR', 'Packaging',
	 'corporate_overseas', 'approved', NULL, 'MY-88442211',
	 'not_registered', 'OP', 'Lot 18 Jalan Kempas, Johor Bahru', 'Lot 18 Jalan Kempas, Johor Bahru',
	 'Maybank', '5140-11223344', 'MBBEMYKL', 'Net 45', 0,
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO partner_supplier_evaluations (
	id, partner_id, evaluation_date, evaluation_category, evaluator_email,
	defect_rate, return_rate, on_time_delivery_pct, lead_time_reliability_score,
	price_competitiveness_score, payment_terms_score, responsiveness_score,
	after_sales_support_score, certification_score, credit_check_score,
	environmental_compliance_score, quality_score, delivery_score, price_score,
	service_score, compliance_score, financial_stability_score, sustainability_score,
	quality_weight, delivery_weight, price_weight, service_weight, compliance_weight,
	financial_stability_weight, sustainability_weight, gold_threshold, silver_threshold,
	bronze_threshold, overall_score, overall_rating, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-seval-001', 'mock-remote-supp-001', '2026-05-20', 'quarterly', 'procurement@smartfin.local',
	 1.5, 0.5, 96, 90, 82, 86, 93, 88, 92, 85, 78, 91, 94, 82, 91, 87, 84, 78,
	 20, 20, 15, 15, 15, 10, 5, 85, 70, 55, 88.6, 'gold', 'Preferred supplier for QC-routed components.',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-seval-002', 'mock-remote-supp-002', '2026-05-22', 'quarterly', 'procurement@smartfin.local',
	 3.0, 1.2, 88, 82, 90, 80, 84, 80, 72, 78, 70, 82, 84, 88, 82, 74, 76, 70,
	 20, 20, 15, 15, 15, 10, 5, 85, 70, 55, 80.1, 'silver', 'Approved overseas packaging supplier.',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Inventory: item master, warehouse, bins, stock and movements.
INSERT INTO warehouses (
	id, code, name, status, address_line1, city, country, contact_name, contact_email,
	notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-wh-001', 'WH-SG-MAIN', 'Singapore Main Warehouse', 'active', '5 Pioneer Road', 'Singapore', 'Singapore', 'Warehouse Ops', 'warehouse@smartfin.local', 'Remote mock warehouse', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO warehouse_bin_locations (
	id, warehouse_id, code, name, location_type, aisle, rack, shelf, bin, barcode,
	is_pickable, is_receivable, is_default_putaway, status, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-bin-001', 'mock-remote-wh-001', 'A1-R1-S1', 'General Pick Bin', 'general', 'A1', 'R1', 'S1', 'B01', 'BIN-A1-R1-S1', 1, 1, 1, 'active', 'Default putaway bin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-bin-002', 'mock-remote-wh-001', 'QC-01', 'QC Quarantine Bin', 'quarantine', 'QC', 'R1', 'S1', 'Q01', 'BIN-QC-01', 0, 1, 0, 'active', 'QC hold area', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO items (
	id, code, name, description, item_type, status, category, uom, uom_category,
	preferred_supplier_id, reorder_point, min_level, max_level, lead_time_days,
	lot_control, serial_control, shelf_life_days, valuation_method,
	standard_cost, last_cost, average_cost, currency, primary_barcode_value,
	primary_barcode_type, notes, inspection_required, over_receipt_tolerance_pct,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-item-001', 'COMP-CONTROL-01', 'Control Board Assembly', 'QC-routed electronics component', 'raw_material', 'active', 'Electronics', 'pcs', 'count',
	 'mock-remote-supp-001', 25, 10, 200, 14, 1, 1, NULL, 'weighted_average',
	 48, 52, 50, 'SGD', '880000000001', 'code128', 'Used by procurement GRN test', 1, 5,
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-item-002', 'PACK-BOX-10KG', 'Export Carton 10kg', 'Carton used for export packing', 'consumable', 'active', 'Packaging', 'pcs', 'count',
	 'mock-remote-supp-002', 200, 100, 1200, 7, 0, 0, NULL, 'weighted_average',
	 1.2, 1.35, 1.3, 'SGD', '880000000002', 'code128', 'Packaging consumable', 0, 10,
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_stock_levels (
	id, item_id, warehouse_id, bin_location_id, quantity_on_hand, quantity_reserved,
	quantity_incoming, unit_cost, last_movement_at, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-stock-001', 'mock-remote-item-001', 'mock-remote-wh-001', 'mock-remote-bin-001', 40, 5, 20, 50, '2026-05-25T10:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-stock-002', 'mock-remote-item-002', 'mock-remote-wh-001', 'mock-remote-bin-001', 600, 120, 0, 1.3, '2026-05-18T09:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO inventory_stock_movements (
	id, item_id, warehouse_id, bin_location_id, movement_type, quantity_delta,
	quantity_after, unit_cost, reference_type, reference_id, performed_by_email,
	notes, reason_code, value_delta, created_at, updated_at
) VALUES
	('mock-remote-move-001', 'mock-remote-item-001', 'mock-remote-wh-001', 'mock-remote-bin-001', 'adjustment', 40, 40, 50, 'seed', 'mock-remote-seed', 'warehouse@smartfin.local', 'Opening balance for remote mock', 'opening_balance', 2000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('mock-remote-move-002', 'mock-remote-item-002', 'mock-remote-wh-001', 'mock-remote-bin-001', 'adjustment', 600, 600, 1.3, 'seed', 'mock-remote-seed', 'warehouse@smartfin.local', 'Opening balance for remote mock', 'opening_balance', 780, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Project and HR data.
INSERT INTO persons (
	id, name, email, phone, tax_id, metadata, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-person-001', 'Alice Tan', 'alice.tan@smartfin.local', '+65 9123 4567', 'S1234567A', '{"source":"remote-business-mock","dept":"operations"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-person-002', 'Rahim Iskandar', 'rahim.iskandar@smartfin.local', '+65 9234 5678', 'S2345678B', '{"source":"remote-business-mock","dept":"finance"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-person-003', 'Mei Chen', 'mei.chen@smartfin.local', '+65 9345 6789', 'F3344556C', '{"source":"remote-business-mock","dept":"procurement"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_profiles (
	id, person_id, employment_type, status, start_date, end_date, cpf_applicable,
	tax_resident_label, location, metadata, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-eprof-001', 'mock-remote-person-001', 'full_time', 'active', '2025-08-01', NULL, 1, 'Singapore citizen', 'Singapore', '{"role":"Operations Lead"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-eprof-002', 'mock-remote-person-002', 'full_time', 'active', '2025-11-01', NULL, 1, 'Singapore PR', 'Singapore', '{"role":"Finance Analyst"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-eprof-003', 'mock-remote-person-003', 'contractor', 'active', '2026-01-10', NULL, 0, 'Non-resident', 'Singapore', '{"role":"Procurement Specialist"}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- HR: Leave Management, Attendance Management, and Overtime Management.
INSERT INTO leave_types (
	id, code, name, description, is_paid, requires_document, requires_approval,
	affects_payroll, status, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-leave-type-al', 'REMOTE_AL', 'Remote Mock Annual Leave', 'Annual leave type for remote testing', 1, 0, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-leave-type-sl', 'REMOTE_SL', 'Remote Mock Sick Leave', 'Sick leave type for remote testing', 1, 1, 1, 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-leave-type-ul', 'REMOTE_UL', 'Remote Mock Unpaid Leave', 'Unpaid leave type for payroll-effect testing', 0, 0, 1, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_balances (
	id, person_id, leave_type_id, year, entitled_days, used_days, pending_days,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-lbal-001', 'mock-remote-person-001', 'mock-remote-leave-type-al', 2026, 18, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-lbal-002', 'mock-remote-person-001', 'mock-remote-leave-type-sl', 2026, 14, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-lbal-003', 'mock-remote-person-002', 'mock-remote-leave-type-al', 2026, 16, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-lbal-004', 'mock-remote-person-003', 'mock-remote-leave-type-ul', 2026, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_requests (
	id, person_id, leave_type_id, start_date, end_date, total_days, status,
	reason, source, submitted_at, approved_by_user_id, approved_at,
	rejected_by_user_id, rejected_at, rejection_reason, payroll_effect,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-leave-001', 'mock-remote-person-001', 'mock-remote-leave-type-al', '2026-06-10', '2026-06-11', 2, 'approved',
	 'Family travel', 'employee_portal', '2026-05-28T09:15:00Z', NULL, '2026-05-28T15:30:00Z',
	 NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-leave-002', 'mock-remote-person-002', 'mock-remote-leave-type-sl', '2026-06-03', '2026-06-03', 1, 'pending',
	 'Medical appointment, document to follow', 'employee_portal', '2026-06-01T08:45:00Z', NULL, NULL,
	 NULL, NULL, NULL, 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-leave-003', 'mock-remote-person-003', 'mock-remote-leave-type-ul', '2026-06-17', '2026-06-17', 1, 'approved',
	 'Personal matter', 'manual', '2026-06-01T10:00:00Z', NULL, '2026-06-01T16:00:00Z',
	 NULL, NULL, NULL, 'pending_export', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-leave-004', 'mock-remote-person-001', 'mock-remote-leave-type-al', '2026-07-04', '2026-07-04', 1, 'rejected',
	 'Blackout period request', 'employee_portal', '2026-06-01T11:10:00Z', NULL, NULL,
	 NULL, '2026-06-01T14:20:00Z', 'Project go-live coverage required', 'not_applicable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO leave_approval_records (
	id, leave_request_id, action, actor_id, actor_name, from_status, to_status,
	comment, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-lappr-001', 'mock-remote-leave-001', 'approved', NULL, 'HR Manager', 'pending', 'approved', 'Approved for planned annual leave', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-lappr-002', 'mock-remote-leave-003', 'approved', NULL, 'HR Manager', 'pending', 'approved', 'Approved, payroll deduction pending export', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-lappr-003', 'mock-remote-leave-004', 'rejected', NULL, 'Project Manager', 'pending', 'rejected', 'Coverage needed during go-live', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO attendance_records (
	id, person_id, work_date, check_in_time, check_out_time, worked_minutes,
	late_minutes, early_leave_minutes, overtime_minutes, status, source,
	payroll_effect, notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-att-001', 'mock-remote-person-001', '2026-06-01', '09:00', '18:15', 555, 0, 0, 75, 'present', 'terminal',
	 'not_applicable', 'Detected overtime after shipment cut-off support', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-att-002', 'mock-remote-person-002', '2026-06-01', '09:27', '18:00', 513, 27, 0, 0, 'late', 'mobile',
	 'pending_review', 'Late check-in requires HR review', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-att-003', 'mock-remote-person-003', '2026-06-01', '08:55', '20:05', 670, 0, 0, 190, 'present', 'terminal',
	 'not_applicable', 'Supplier RFQ deadline support', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-att-004', 'mock-remote-person-001', '2026-06-10', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'leave_sync',
	 'not_applicable', 'Synced from approved annual leave', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-att-005', 'mock-remote-person-002', '2026-06-03', NULL, NULL, NULL, 0, 0, 0, 'on_leave', 'leave_sync',
	 'not_applicable', 'Pending sick leave reflected for roster visibility', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-att-006', 'mock-remote-person-003', '2026-06-02', '09:02', NULL, NULL, 2, 0, 0, 'missing_checkout', 'terminal',
	 'pending_review', 'Missing checkout needs correction', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO overtime_requests (
	id, person_id, attendance_record_id, work_date, overtime_minutes, reason,
	status, source, approved_by_user_id, approved_at, rejected_by_user_id,
	rejected_at, rejection_reason, payroll_effect, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-ot-001', 'mock-remote-person-001', 'mock-remote-att-001', '2026-06-01', 75, 'Shipment cut-off support for Northstar replenishment',
	 'approved', 'attendance_detected', NULL, '2026-06-02T09:30:00Z', NULL,
	 NULL, NULL, 'pending_export', 'Approved OT, ready for payroll export',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-ot-002', 'mock-remote-person-003', 'mock-remote-att-003', '2026-06-01', 190, 'Supplier RFQ clarification calls after hours',
	 'pending', 'attendance_detected', NULL, NULL, NULL,
	 NULL, NULL, 'not_applicable', 'Pending HR approval',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO overtime_approval_records (
	id, overtime_request_id, action, actor_id, actor_name, from_status, to_status,
	comment, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-otappr-001', 'mock-remote-ot-001', 'approved', NULL, 'HR Manager', 'pending', 'approved', 'Approved for urgent shipment support', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO projects (
	id, business_partner_id, owner_id, parent_project_id, name, status, type,
	start_date, end_date, deadline, description, notes, priority, attachment_url,
	attachment_name, recurrence_frequency, recurrence_interval, recurrence_parent_id,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-proj-001', 'mock-remote-cust-001', NULL, NULL, 'Northstar Store Replenishment FY26', 'ongoing', 'delivery',
	 '2026-04-01', '2026-12-31', '2026-07-15', 'Monthly replenishment and stock availability project.', 'Remote mock: active high priority project', 9, 'mock://project/northstar-brief.pdf',
	 'northstar-brief.pdf', 'monthly', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-proj-002', 'mock-remote-cust-002', NULL, NULL, 'Straits Food Cold Chain Pilot', 'under_review', 'delivery',
	 '2026-03-15', '2026-09-30', '2026-06-30', 'Cold chain logistics pilot with supplier QC.', 'Remote mock: needs review', 7, NULL,
	 NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-proj-003', 'mock-remote-cust-003', NULL, 'mock-remote-proj-001', 'Northstar Phase 2 Store Rollout', 'unassigned', 'ongoing',
	 '2026-08-01', '2027-02-28', '2026-10-15', 'Sub-project for expanded store rollout.', 'Remote mock: child project', 5, NULL,
	 NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO project_employees (
	id, project_id, person_id, name, role, staff_type, date_in, date_out,
	cpf_applicable, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-pe-001', 'mock-remote-proj-001', 'mock-remote-person-001', 'Alice Tan', 'Project Lead', 'fulltime', '2026-04-01', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-pe-002', 'mock-remote-proj-001', 'mock-remote-person-003', 'Mei Chen', 'Procurement Coordinator', 'freelancer', '2026-04-10', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-pe-003', 'mock-remote-proj-002', 'mock-remote-person-002', 'Rahim Iskandar', 'Finance Reviewer', 'fulltime', '2026-03-20', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_project_allocations (
	id, employee_id, project_id, weight_pct, allocation_mode, effective_from,
	effective_to, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-epa-001', 'mock-remote-person-001', 'mock-remote-proj-001', 70, 'manual', '2026-04-01', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-epa-002', 'mock-remote-person-002', 'mock-remote-proj-002', 50, 'manual', '2026-03-20', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO employee_salaries (
	id, employee_id, month, salary, allowance, cpf_employee, cpf_employer,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-salary-001', 'mock-remote-person-001', '2026-05', 6800, 500, 1360, 1156, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-salary-002', 'mock-remote-person-002', '2026-05', 5200, 300, 1040, 884, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Project archive documents.
INSERT INTO contracts (
	id, project_id, business_partner_id, client_name, contract_number, effective_date,
	expiry_date, scope, type, file_url, amount, currency, status, payment_terms,
	metadata, notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-contract-001', 'mock-remote-proj-001', 'mock-remote-cust-001', 'Northstar Retail Pte Ltd', 'CTR-NS-2026-001', '2026-04-01',
	 '2026-12-31', 'Store replenishment services', 'customer_contract', 'mock://contracts/CTR-NS-2026-001.pdf', 180000, 'SGD', 'active', '30 days',
	 '{"source":"remote-business-mock"}', 'Customer supply agreement', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO quotations (
	id, project_id, business_partner_id, client_name, quotation_number, file_url,
	amount, currency, date, status, valid_until, line_items, metadata, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-quote-001', 'mock-remote-proj-001', 'mock-remote-cust-001', 'Northstar Retail Pte Ltd', 'Q-NS-2026-001', 'mock://quotations/Q-NS-2026-001.pdf',
	 72000, 'SGD', '2026-04-05', 'accepted', '2026-05-05', '[{"item":"Replenishment setup","amount":72000}]', '{"source":"remote-business-mock"}', 'Accepted quotation',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO purchase_orders (
	id, project_id, business_partner_id, client_name, po_number, file_url, supplier_name,
	amount, currency, date, description, status, line_items, metadata, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-archive-po-001', 'mock-remote-proj-001', 'mock-remote-supp-001', 'Pacific Components Pte Ltd', 'ARCH-PO-2026-001', 'mock://project-po/ARCH-PO-2026-001.pdf', 'Pacific Components Pte Ltd',
	 26000, 'SGD', '2026-04-12', 'Project archive PO document', 'confirmed', '[{"item":"Control Board Assembly","qty":200}]', '{"source":"remote-business-mock"}', 'Archive-side PO, distinct from procurement PO workflow',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Procurement workflow: RFQ -> supplier quotations -> PO -> GRN.
INSERT INTO procurement_rfqs (
	id, rfq_number, title, source_type, source_id, project_id, status, currency,
	required_by_date, created_by_email, notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-rfq-001', 'RFQ-REMOTE-2026-001', 'Control board replenishment RFQ', 'manual', NULL, 'mock-remote-proj-001', 'awarded', 'SGD',
	 '2026-05-31', 'procurement@smartfin.local', 'Remote mock RFQ with two suppliers', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_rfq_items (
	id, rfq_id, item_code, description, quantity, uom, target_unit_price,
	notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-rfq-item-001', 'mock-remote-rfq-001', 'COMP-CONTROL-01', 'Control Board Assembly', 200, 'pcs', 55, 'QC required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_rfq_suppliers (
	id, rfq_id, supplier_id, contact_name, contact_email, status, sent_at,
	notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-rfq-supp-001', 'mock-remote-rfq-001', 'mock-remote-supp-001', 'Irene Lim', 'irene@pacific-components.sg', 'responded', '2026-05-01T08:00:00Z', 'Preferred supplier', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-rfq-supp-002', 'mock-remote-rfq-001', 'mock-remote-supp-002', 'Ahmad Rahman', 'ahmad@jb-packaging.my', 'responded', '2026-05-01T08:00:00Z', 'Alternate supplier', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_supplier_quotations (
	id, rfq_id, rfq_supplier_id, supplier_id, quotation_number, status, submitted_at,
	currency, lead_time_days, delivery_terms, payment_terms, validity_date,
	shipping_amount, tax_amount, duties_amount, discount_amount, subtotal_amount,
	total_cost, supplier_rating_snapshot, notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-squote-001', 'mock-remote-rfq-001', 'mock-remote-rfq-supp-001', 'mock-remote-supp-001', 'PQ-2026-0098', 'selected', '2026-05-03T09:00:00Z',
	 'SGD', 12, 'DAP Singapore', 'Net 30', '2026-06-03', 350, 936, 0, 0, 10400,
	 11686, 88.6, 'Best technical fit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-squote-002', 'mock-remote-rfq-001', 'mock-remote-rfq-supp-002', 'mock-remote-supp-002', 'JBQ-2026-077', 'submitted', '2026-05-04T10:30:00Z',
	 'SGD', 18, 'EXW Johor', 'Net 45', '2026-06-04', 780, 0, 150, 0, 9800,
	 10730, 80.1, 'Lower unit cost, longer lead time', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_supplier_quotation_items (
	id, quotation_id, rfq_item_id, quantity, unit_price, line_total, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-squote-item-001', 'mock-remote-squote-001', 'mock-remote-rfq-item-001', 200, 52, 10400, 'Selected line', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-squote-item-002', 'mock-remote-squote-002', 'mock-remote-rfq-item-001', 200, 49, 9800, 'Alternate quote', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_orders (
	id, po_number, source_type, source_id, rfq_id, quotation_id, supplier_id,
	project_id, status, approval_status, approval_required, approval_threshold_amount,
	supplier_risk_level, approved_by_email, approved_at, po_date, delivery_date,
	goods_receipt_date, currency, tax_code, incoterms, billing_address, ack_status,
	ack_requested_at, acknowledged_at, supplier_ack_reference, subtotal_amount,
	shipping_amount, tax_amount, duties_amount, total_amount, competitive_quotes_count,
	after_the_fact_flag, ia_exception_code, ia_exception_reason, created_by_email,
	notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-proc-po-001', 'PO-REMOTE-2026-001', 'rfq', 'mock-remote-rfq-001', 'mock-remote-rfq-001', 'mock-remote-squote-001', 'mock-remote-supp-001',
	 'mock-remote-proj-001', 'partially_received', 'approved', 1, 50000,
	 'low', 'owner@smartfin.local', '2026-05-05T09:00:00Z', '2026-05-06', '2026-05-25',
	 '2026-05-25', 'SGD', 'SR', 'DAP', '8 Marina View, Singapore', 'acknowledged',
	 '2026-05-06T10:00:00Z', '2026-05-07T11:00:00Z', 'ACK-PC-2026-001', 10400,
	 350, 936, 0, 11686, 2,
	 0, NULL, NULL, 'procurement@smartfin.local',
	 'Remote mock procurement PO with partial GRN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_order_items (
	id, po_id, item_code, description, quantity, received_quantity, back_ordered_quantity,
	uom, unit_price, line_subtotal, tax_code, delivery_date, item_id, warehouse_id,
	bin_location_id, quarantine_bin_id, inspection_required, notes,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-proc-po-item-001', 'mock-remote-proc-po-001', 'COMP-CONTROL-01', 'Control Board Assembly', 200, 80, 120,
	 'pcs', 52, 10400, 'SR', '2026-05-25', 'mock-remote-item-001', 'mock-remote-wh-001',
	 'mock-remote-bin-001', 'mock-remote-bin-002', 1, 'First delivery partially received',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO procurement_purchase_order_receipts (
	id, po_id, po_item_id, receipt_number, receipt_date, quantity_received,
	accepted_quantity, rejected_quantity, back_order_quantity, status,
	inspection_required, inspection_status, inspection_decision_at,
	inspection_decision_by_email, inspection_notes, return_required,
	over_receipt_flag, item_id, warehouse_id, bin_location_id, quarantine_bin_id,
	unit_cost, acceptance_movement_id, payment_triggered_at, payment_reference,
	received_by_email, notes, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-grn-001', 'mock-remote-proc-po-001', 'mock-remote-proc-po-item-001', 'GRN-REMOTE-2026-001', '2026-05-25', 80,
	 76, 4, 120, 'accepted',
	 1, 'accepted', '2026-05-26T09:30:00Z',
	 'qc@smartfin.local', '4 units rejected for solder defects', 1,
	 0, 'mock-remote-item-001', 'mock-remote-wh-001', 'mock-remote-bin-001', 'mock-remote-bin-002',
	 52, 'mock-remote-move-001', '2026-05-26T10:00:00Z', 'AP-REMOTE-2026-001',
	 'warehouse@smartfin.local', 'QC accepted partial receipt and triggered payment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Finance: categories, expenses, revenue and GST.
INSERT INTO expense_categories (
	id, name, is_system, parent_id, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-cat-logistics', 'Remote Mock Logistics', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cat-travel', 'Remote Mock Travel', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-cat-procurement', 'Remote Mock Procurement', 'true', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO expenses (
	id, project_id, expense_type, category, doc_type, date, amount, currency,
	sgd_equivalent, gst_amount, vendor_or_supplier, staff_name, reimbursement,
	business_trip, destination, document_ref, metadata, notes, gst_code,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-exp-001', 'mock-remote-proj-001', 'sales_cost', 'Remote Mock Procurement', 'supplier_invoice', '2026-05-26', 11686, 'SGD',
	 11686, 936, 'Pacific Components Pte Ltd', NULL, 0, 0, NULL, 'mock://expenses/AP-REMOTE-2026-001.pdf', '{"source":"remote-business-mock","poId":"mock-remote-proc-po-001"}', 'Supplier invoice from accepted GRN', 'SR',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-exp-002', 'mock-remote-proj-002', 'opex', 'Remote Mock Travel', 'receipt', '2026-05-18', 860, 'SGD',
	 860, 77.4, NULL, 'Rahim Iskandar', 1, 1, 'Johor Bahru', 'mock://expenses/travel-2026-05.pdf', '{"source":"remote-business-mock","trip":"supplier audit"}', 'Supplier audit travel claim', 'SR',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO revenue (
	id, invoice_type, invoice_number, client_name, project_id, date, amount,
	currency, sgd_equivalent, gst_amount, document_ref, notes, metadata, gst_code,
	created_at, updated_at, deleted_at
) VALUES
	('mock-remote-rev-001', 'customer_invoice', 'INV-REMOTE-2026-001', 'Northstar Retail Pte Ltd', 'mock-remote-proj-001', '2026-05-31', 42000,
	 'SGD', 42000, 3780, 'mock://revenue/INV-REMOTE-2026-001.pdf', 'Monthly replenishment billing', '{"source":"remote-business-mock"}', 'SR',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-rev-002', 'customer_invoice', 'INV-REMOTE-2026-002', 'Straits Food Services Pte Ltd', 'mock-remote-proj-002', '2026-05-28', 18500,
	 'SGD', 18500, 1665, 'mock://revenue/INV-REMOTE-2026-002.pdf', 'Cold chain pilot milestone billing', '{"source":"remote-business-mock"}', 'SR',
	 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO company_settings (
	key, value, created_at, updated_at, deleted_at
) VALUES
	('mock_remote_gst_box9_manual', '1200', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock_remote_gst_box10_manual', '800', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock_remote_gst_box11_manual', '500', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock_remote_gst_box12_manual', '2000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

INSERT INTO gst_returns (
	id, quarter, year, box_1, box_2, box_3, box_4, box_5, box_6,
	box_7, box_8, box_9, box_10, box_11, box_12, box_13, status,
	generated_at, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-gst-2026-q2', 'Q2', '2026', 60500, 0, 60500, 5445, 12546, 1013.4,
	 4431.6, 0, 1200, 800, 500, 2000, 180000, 'draft',
	 '2026-06-30T12:00:00Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);

-- Minimal audit samples. Real runtime audit rows will be generated by services.
INSERT INTO audit_logs (
	id, actor_user_id, actor_email, action, entity_type, entity_id, project_id,
	metadata, ip_address, module, action_type, old_value, new_value, hash_chain,
	seq, created_at, updated_at, deleted_at
) VALUES
	('mock-remote-audit-001', NULL, 'seed@smartfin.local', 'seed.remote_business_mock', 'seed', 'mock-remote-seed', NULL,
	 '{"source":"remote-business-mock"}', '127.0.0.1', 'core', 'system', NULL, '{"status":"inserted"}', NULL,
	 NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
	('mock-remote-audit-002', NULL, 'procurement@smartfin.local', 'purchase_order.payment.triggered', 'procurement_purchase_order', 'mock-remote-proc-po-001', 'mock-remote-proj-001',
	 '{"paymentReference":"AP-REMOTE-2026-001","source":"remote-business-mock"}', '127.0.0.1', 'procurement', 'create', NULL, '{"status":"partially_received"}', NULL,
	 NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL);
