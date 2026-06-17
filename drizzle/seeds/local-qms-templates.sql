-- ISO 9001 QMS template library seed (Axiom Tech baseline).
-- Mirrors the "模块 → 建议文件" reference table. Idempotent via INSERT OR IGNORE
-- on the unique `code`. task_type is the matching key for scope='task' rows;
-- responsible_role 'self' resolves to the task assignee, named roles resolve to
-- the project collaborator holding that role.

-- 公司层面 (company scope — static register, project-less)
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_qp001',  'QP-001',  'Quality Policy',        '公司层面', 'company', NULL, NULL, 0, 1, 10),
 ('qmst_qo001',  'QO-001',  'Quality Objectives',    '公司层面', 'company', NULL, NULL, 0, 1, 11),
 ('qmst_qms001', 'QMS-001', 'QMS Scope',             '公司层面', 'company', NULL, NULL, 0, 1, 12),
 ('qmst_pmap01', 'PMAP-001','Process Map',           '公司层面', 'company', NULL, NULL, 0, 1, 13);

-- 销售/项目
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_sal001', 'SAL-001', 'Customer Requirement Review', '销售/项目', 'task',    'sales', 'self', 1, 1, 20),
 ('qmst_sal002', 'SAL-002', 'Quotation/PO Review',         '销售/项目', 'task',    'sales', 'self', 1, 1, 21),
 ('qmst_prj001', 'PRJ-001', 'Project Kick-off Checklist',  '销售/项目', 'project', NULL,    'pm',   0, 1, 22);

-- 设计开发 (design — sign-off heavy)
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_dd001',   'DD-001',   'Design & Development Procedure', '设计开发', 'task', 'design', 'self',     0, 1, 30),
 ('qmst_dr001',   'DR-001',   'Design Review',                  '设计开发', 'task', 'design', 'reviewer', 1, 1, 31),
 ('qmst_dv001',   'DV-001',   'Design Verification',            '设计开发', 'task', 'design', 'self',     1, 1, 32),
 ('qmst_dval001', 'DVAL-001', 'Design Validation',              '设计开发', 'task', 'design', 'self',     1, 1, 33);

-- 采购外包
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_sup001', 'SUP-001', 'Supplier Evaluation',   '采购外包', 'task', 'procurement', 'self', 0, 1, 40),
 ('qmst_sup002', 'SUP-002', 'Approved Supplier List','采购外包', 'task', 'procurement', 'self', 0, 1, 41),
 ('qmst_inc001', 'INC-001', 'Incoming Inspection',   '采购外包', 'task', 'inspection',  'qa',   1, 1, 42);

-- 生产/装配
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_asm001', 'ASM-001', 'Assembly Work Instruction', '生产/装配', 'task', 'production', 'self', 0, 1, 50),
 ('qmst_itp001', 'ITP-001', 'Inspection & Test Plan',    '生产/装配', 'task', 'production', 'qa',   1, 1, 51),
 ('qmst_fat001', 'FAT-001', 'FAT/SAT Checklist',         '生产/装配', 'task', 'inspection', 'qa',   1, 1, 52);

-- 软件/AI 项目
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_sw001', 'SW-001', 'Version Control', '软件/AI 项目', 'task', 'software', 'self', 0, 1, 60),
 ('qmst_sw002', 'SW-002', 'Release Note',    '软件/AI 项目', 'task', 'software', 'self', 0, 1, 61),
 ('qmst_sw003', 'SW-003', 'UAT Record',      '软件/AI 项目', 'task', 'software', 'self', 1, 1, 62),
 ('qmst_sw004', 'SW-004', 'Issue Log',       '软件/AI 项目', 'task', 'software', 'self', 0, 1, 63);

-- 文控
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_doc001', 'DOC-001', 'Document Control',        '文控', 'company', NULL,               NULL,   0, 1, 70),
 ('qmst_doc002', 'DOC-002', 'Record Control',          '文控', 'company', NULL,               NULL,   0, 1, 71),
 ('qmst_doc003', 'DOC-003', 'Drawing Revision Control','文控', 'task',    'document_control', 'self', 0, 1, 72);

-- 质量问题
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_ncr001',  'NCR-001',  'Nonconformity Report',       '质量问题', 'task', 'quality', 'qa', 1, 1, 80),
 ('qmst_capa001', 'CAPA-001', 'Corrective Action / CAPA',   '质量问题', 'task', 'quality', 'qa', 1, 1, 81);

-- 内部管理
INSERT OR IGNORE INTO qms_templates (id, code, name, module_category, scope, task_type, responsible_role, requires_approval, is_active, order_index) VALUES
 ('qmst_ia001',  'IA-001',  'Internal Audit',                '内部管理', 'project', NULL, 'pm', 0, 1, 90),
 ('qmst_mr001',  'MR-001',  'Management Review',             '内部管理', 'company', NULL, NULL, 0, 1, 91),
 ('qmst_ror001', 'ROR-001', 'Risk & Opportunity Register',   '内部管理', 'project', NULL, 'pm', 0, 1, 92);
