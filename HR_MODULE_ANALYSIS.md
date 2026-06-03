# HR 模块架构分析报告

> **分析日期：** 2026-05-28
> **分析范围：** `src/modules/hr` · `src/routes/(app)/hr`
> **分析性质：** 只读架构分析，不涉及任何代码修改

---

## 1. Executive Summary（执行摘要）

当前 HR 模块是一个**设计较为完整、架构清晰的核心模块**，绝对不应推倒重来。它已经实现了：

- 以 `persons + person_roles + employee_profiles` 替代传统 `employees` 表的现代身份模型
- 完整的薪酬组件体系（公司级 → 项目权重 → 项目影子组件 → 结算记录）
- 与 Project 模块的深度集成（项目人员配置、月度结算）
- 事件驱动的跨模块协作机制
- 兼容层 / 适配器层，用于平滑过渡

**结论：保留并在此基础上扩展。** 当前模块缺少的是组织结构（部门、职位）、合规文件（合同、证件）、考勤休假、绩效、培训、招聘等上层功能，这些都可以干净地叠加在现有架构之上。

---

## 2. File Structure Analysis（文件结构分析）

### 2.1 目录结构总览

```
src/modules/hr/
├── index.ts                          ← 模块注册入口（ModuleDefinition）
├── api.ts                            ← 公共 API 工厂 createHrApi()
├── employee-api.ts                   ← HrDirectoryApi 工厂
├── person-api.ts                     ← HrPeopleApi 工厂
├── contracts.ts                      ← 接口契约（HrDirectorySource / HrPeopleSource）
├── adapters.ts                       ← 将 Services 适配到 Source 接口的工厂
├── compat.ts                         ← 顶层 compat helpers（供旧调用方使用）
├── handlers.ts                       ← 事件处理器（监听 project.archived）
├── README.md                         ← 模块边界说明文档
├── repositories/
│   ├── person.schema.ts              ← persons / person_roles / employee_profiles 等表定义
│   ├── person-repository.ts          ← PersonRepository / EmployeeProfileRepository
│   ├── employee.schema.ts            ← salaries / compensation_components / allocations / payouts 表定义
│   └── employee-repository.ts        ← CompensationComponentRepository / PayoutRepository 等
└── services/
    ├── person-service.ts             ← PersonService（身份 CRUD）
    ├── person-events.ts              ← person.created / person.role.added 事件类型
    ├── employee-service.ts           ← CompensationService / SettlementService / ProjectStaffingService / AllocationService
    ├── employee-events.ts            ← payout.settled / allocation.updated 事件类型
    └── employee-master-service.ts    ← EmployeeMasterService（员工列表/详情/档案 CRUD）

src/routes/(app)/hr/
└── employees/
    ├── +page.server.ts               ← 员工列表 load()
    ├── +page.svelte                  ← 员工列表 UI
    ├── new/
    │   ├── +page.server.ts           ← 创建员工 action
    │   └── +page.svelte              ← 创建员工表单
    └── [id]/
        ├── +page.server.ts           ← 员工详情 load() + 多 actions
        └── +page.svelte              ← 员工详情 UI
```

### 2.2 文件职责与类型

| 文件 | 类型 | 职责 |
|------|------|------|
| `index.ts` | **核心** | 模块声明（id、依赖、layer）与 handler 注册 |
| `employee-master-service.ts` | **核心** | HR 后台主要业务逻辑（列表、详情、组件管理） |
| `employee-service.ts` | **核心** | 薪酬结算、项目人员配置、分配服务（4 个 Service 类） |
| `person-service.ts` | **核心** | 人员身份管理（增删改查） |
| `person.schema.ts` | **核心** | persons / person_roles / employee_profiles 等表 DDL |
| `employee.schema.ts` | **核心** | salaries / components / allocations / payouts 表 DDL |
| `person-repository.ts` | **核心** | 人员相关表的 Drizzle 查询封装 |
| `employee-repository.ts` | **核心** | 薪酬相关表的 Drizzle 查询封装 |
| `api.ts` / `employee-api.ts` / `person-api.ts` | **核心** | 模块对外暴露的 API 工厂函数 |
| `contracts.ts` | **兼容桥接** | 定义 Source 接口（HrDirectorySource / HrPeopleSource），供外部消费 |
| `adapters.ts` | **兼容桥接** | 将 Services 实现适配到 Source 接口 |
| `compat.ts` | **兼容桥接** | 为旧调用路径提供顶层函数包装（不依赖 ModuleContext） |
| `handlers.ts` | **集成** | 跨模块事件处理（监听 `project.archived`） |
| `person-events.ts` / `employee-events.ts` | **集成** | 事件类型定义 |

---

## 3. Data Model Analysis（数据模型分析）

### 3.1 Person 身份层（`person.schema.ts`）

```
persons（人员主表）
  id, name, email, phone, taxId, metadata, timestamps
     │
     │ 1:N
     ▼
person_roles（角色关联表）
  personId → persons.id
  roleType: employee | shareholder | freelancer | director | advisor | contact
  entityId  → 对应 Profile 表的 id
  validFrom / validTo（有效期）
     │
     ├──► employee_profiles      雇员信息（雇佣类型、状态、CPF、税居民、起止日期）
     ├──► shareholder_profiles   股东信息（股比、分红账户）
     └──► freelancer_profiles    自由职业者信息（费率类型、费率金额、计费条款）
```

**关键设计：** 同一个自然人（`persons` 行）可以同时持有多个角色（如 `employee` + `shareholder`），通过 `person_roles` 多条记录表达，避免多张主表数据冗余。

### 3.2 薪酬与结算层（`employee.schema.ts`）

| 表名 | 用途 |
|------|------|
| `employee_salaries` | 历史月薪台账（month, salary, allowance, CPF） |
| `employee_compensation_components` | 公司级薪酬规则（固定 / 利润比 / 收入比 / 股权分享等） |
| `employee_project_allocations` | 员工跨项目成本分配权重（weightPct，支持 manual / timesheet） |
| `compensation_components` | 项目级薪酬组件（origin: manual 或 company_allocated 影子组件） |
| `payout_records` | 最终结算输出（period, amount, CPF, status: draft→confirmed→paid） |

### 3.3 完整关系链

```
persons
  └── employee_profiles（1:1，via person_roles）
        ├── employee_salaries              历史薪资台账
        ├── employee_compensation_components  公司薪酬规则
        │     └── employee_project_allocations  跨项目权重
        │           └── compensation_components[origin=company_allocated]  影子组件
        └── project_employees（Project 模块定义）
              └── compensation_components[origin=manual]  手动项目组件
                    └── payout_records    结算记录（最终输出）
```

### 3.4 是否使用传统 `employees` 表？

**否。** 项目已完全迁移至 `persons + employee_profiles` 模型。`person-repository.ts` 中虽保留 `EmployeeRepository` 类，但其注释标注为 **legacy compat**，实际业务逻辑已全部走 `PersonRepository + EmployeeProfileRepository`。

---

## 4. Backend Flow Analysis（后端流程分析）

### 4.1 加载员工列表

```
GET /hr/employees
  └── +page.server.ts → load()
        └── createHrApi(ctx).directory
              └── HrDirectoryApi.listEmployees()              [employee-api.ts]
                    └── EmployeeMasterService.listEmployees() [employee-master-service.ts]
                          ├── PersonRepository.listAllPersons()        → SELECT persons
                          ├── EmployeeProfileRepository.listAll()      → SELECT employee_profiles
                          └── 组合拼装 EmployeeRow[]                   ← 返回给页面
```

### 4.2 创建新员工

```
POST /hr/employees/new
  └── new/+page.server.ts → actions.default
        └── createHrApi(ctx).directory.createEmployeeProfile(formData)
              └── EmployeeMasterService.createEmployeeProfile(data)
                    └── db.transaction()
                          ├── PersonRepository.create()              → INSERT persons
                          ├── EmployeeProfileRepository.create()     → INSERT employee_profiles
                          ├── PersonRoleRepository.create()          → INSERT person_roles
                          └── emit: person.created / person.role.added
  └── redirect → /hr/employees/[newId]
```

### 4.3 加载员工详情

```
GET /hr/employees/[id]
  └── [id]/+page.server.ts → load()
        └── createHrApi(ctx).directory.getEmployeeDetailPage(id, taxYear)
              └── EmployeeMasterService.getEmployeeDetailPage()
                    ├── PersonRepository.getById()                     → SELECT persons
                    ├── EmployeeProfileRepository.getByPersonId()      → SELECT employee_profiles
                    ├── CompensationComponentRepository.listByEmployee → SELECT comp_components
                    ├── AllocationRepository.listByEmployee()          → SELECT allocations
                    ├── db: SELECT project_employees JOIN projects      → 项目参与列表
                    ├── PayoutRepository.listByEmployee(year)          → SELECT payout_records
                    └── estimateSingaporeResidentTax()                 ← 调用 Finance 模块
```

### 4.4 员工详情各 Action

| Action 名称 | 调用路径 | 数据库操作 |
|-------------|----------|-----------|
| `updateProfile` | `EmployeeMasterService.updateEmployeeProfile()` | UPDATE persons + employee_profiles |
| `addCompanyComponent` | `EmployeeMasterService.addCompanyComponent()` | INSERT employee_compensation_components |
| `removeCompanyComponent` | `EmployeeMasterService.removeCompanyComponent()` | UPDATE deletedAt（软删除） |
| `saveAllocations` | `EmployeeMasterService.saveEmployeeProjectAllocations()` | 验证权重=100%，软删旧 → INSERT 新，emit allocation.updated |
| `deleteEmployee` | `EmployeeMasterService.deleteEmployee()` | UPDATE persons.deletedAt + employee_profiles.status='inactive' |

---

## 5. Frontend Integration Analysis（前端集成分析）

### 5.1 已有 HR 页面

| 路由 | 页面 | 主要功能 |
|------|------|---------|
| `/hr/employees` | 员工列表 | 表格展示（姓名、类型、状态、起始日期）、新建入口 |
| `/hr/employees/new` | 新建员工 | 表单（姓名、雇佣类型、状态、日期、联系方式、税号） |
| `/hr/employees/[id]` | 员工详情 | 档案编辑、薪酬组件管理、项目参与列表、分配权重设置、税务年度汇总 |

### 5.2 调用模式

**全部使用 SvelteKit 的 `+page.server.ts` 模式**，没有独立的 REST API 路由：

- `load()` 函数负责服务端数据加载，通过 `createHrApi(event.locals)` 获取 API 实例
- `actions` 对象处理表单提交（配合 `use:enhance` 渐进增强），每个操作对应一个具名 action

### 5.3 已实现的 UI 组件

| 组件 / 表单 | 所在页面 | 说明 |
|-------------|---------|------|
| 员工基本信息表单 | `[id]/+page.svelte` | 姓名、类型、状态、日期、CPF、税居民 |
| 公司薪酬组件列表 | `[id]/+page.svelte` | 展示 + 删除按钮 |
| 新增薪酬组件表单 | `[id]/+page.svelte` | label、incomeType、ruleType、value、频率、taxable |
| 项目参与列表 | `[id]/+page.svelte` | 只读展示 project_employees 关联项目 |
| 项目分配权重表单 | `[id]/+page.svelte` | 按项目输入 weightPct，前端验证总和 100% |
| 个人所得税年度汇总 | `[id]/+page.svelte` | 按年 + 按收入类型拆分，含 IR8A 风格税务估算 |

---

## 6. Cross-Module Integration（跨模块集成分析）

### 6.1 模块注册位置

```typescript
// src/app/bootstrap/register-modules.ts
registerModules([
  businessPartnerModule,
  projectModule,
  hrModule,            // layer: 'base', dependencies: ['core', 'project']
  financeModule,
  documentIntakeModule
]);
```

### 6.2 与 Project 模块的集成

| 方向 | 内容 |
|------|------|
| HR → Project | `employee_project_allocations.projectId` 引用 projects 表；`ProjectStaffingService` 读取 `project_employees`（由 Project 模块定义） |
| Project → HR | `project_employees.personId` 外键引用 `persons.id`；Project 路由 `/projects/[id]/employees` 使用 `ProjectStaffingService` |
| 事件（HR 发出）| `allocation.updated` → Project 监听，用于缓存失效 |
| 事件（HR 接收）| `project.archived` → HR 的 `handlers.ts` 软删除该项目所有 allocations |

### 6.3 与 Finance 模块的集成

- `EmployeeMasterService` 调用 Finance 模块导出的 `estimateSingaporeResidentTax()` 函数
- Finance 有 `/api/finance/tax/individual/[employeeId]/[year]` 端点间接依赖 HR 数据

### 6.4 事件契约汇总

| 事件名 | 发出方 | 订阅方 | 用途 |
|--------|--------|--------|------|
| `person.created` | HR | — | 人员创建通知 |
| `person.role.added` | HR | — | 角色添加通知 |
| `allocation.updated` | HR | Project | 分配权重变更，触发缓存失效 |
| `payout.settled` | HR | Finance（潜在） | 薪资结算完成通知 |
| `project.archived` | Project | **HR** | HR 清理该项目所有 allocations |

---

## 7. Gaps Compared with a Full HR Module（与完整 HR 模块的差距分析）

### 7.1 各功能点现状

| 目标功能 | 当前状态 | 说明 |
|----------|----------|------|
| **部门（Department）** | ❌ 完全缺失 | 无 `departments` 表，无上下级树形结构 |
| **职位（Position）** | ❌ 完全缺失 | `employee_profiles.employmentType` 仅为雇佣类型枚举，不是职位体系 |
| **员工职位分配 / 汇报关系** | ❌ 完全缺失 | 无 job_assignments、reporting_line 概念 |
| **员工文件（Documents）** | ⚠️ 极弱 | `persons.metadata` 可存 JSON，但无结构化文档管理 |
| **劳动合同（Contracts）** | ❌ 完全缺失 | 无合同表，无签署流程，无到期提醒 |
| **休假与考勤（Leave & Attendance）** | ❌ 完全缺失 | 无任何相关表或服务 |
| **薪资工作流（Payroll Workflow）** | ✅ 部分实现 | 结算服务 + payout_records 已有；缺审批流、薪资单生成、银行导出 |
| **绩效考核（Performance）** | ❌ 完全缺失 | — |
| **培训发展（Training）** | ❌ 完全缺失 | — |
| **招聘与入职（Recruitment）** | ❌ 完全缺失 | — |

### 7.2 已有基础可复用的部分

| 现有资产 | 可为哪些新功能服务 |
|----------|-----------------|
| `persons` + `person_roles` 模型 | 候选人（招聘）、培训讲师、合同签署方均可作为 person |
| `employee_profiles` | 职位分配的基础实体，部门关联直接加 FK 即可 |
| `freelancer_profiles` | 外包合同管理的起点 |
| `payout_records` + `SettlementService` | 薪资工作流的核心结算层已就绪，可在上层加审批 |
| 事件总线 | 入职事件触发合同生成、休假审批触发通知均可复用 |
| `employee_compensation_components` 的 `ruleType` 枚举 | 绩效奖金等可作为新的 ruleType 值扩展 |

### 7.3 绝对不应删除 / 替换的部分

| 资产 | 原因 |
|------|------|
| `persons` + `person_roles` + `employee_profiles` | 整个模块的身份基础，所有功能依赖 |
| `employee_compensation_components` + `payout_records` | 薪资结算的核心链路，Project 模块深度依赖 |
| `ProjectStaffingService` | Project 模块的人员配置页面完全依赖此服务 |
| `contracts.ts` + `adapters.ts` | 外部模块通过此接口消费 HR，直接改会破坏 API 契约 |
| `handlers.ts` 中的 `project.archived` 处理器 | 保证项目归档时 allocations 被清理，删除会产生脏数据 |

### 7.4 新功能应新增的位置

```
src/modules/hr/
├── repositories/
│   ├── department.schema.ts          ← 新增：departments / positions 表
│   ├── department-repository.ts      ← 新增
│   ├── contract.schema.ts            ← 新增：employment_contracts 表
│   ├── contract-repository.ts        ← 新增
│   ├── leave.schema.ts               ← 新增：leave_policies / leave_requests 表
│   ├── leave-repository.ts           ← 新增
│   ├── performance.schema.ts         ← 新增（后期）
│   └── recruitment.schema.ts         ← 新增（后期）
└── services/
    ├── department-service.ts         ← 新增
    ├── contract-service.ts           ← 新增
    ├── leave-service.ts              ← 新增
    ├── payroll-service.ts            ← 新增（封装现有结算层 + 审批）
    ├── performance-service.ts        ← 新增（后期）
    └── recruitment-service.ts        ← 新增（后期）

src/routes/(app)/hr/
├── departments/                      ← 新增路由
├── positions/                        ← 新增路由
├── contracts/                        ← 新增路由
├── leave/                            ← 新增路由
└── payroll/                          ← 新增路由（复用现有结算服务）
```

---

## 8. Development Recommendation（开发建议）

以下是保持现有架构、渐进式扩展的推荐实施顺序。每个阶段仅新增文件，**不修改现有薪酬结算链路**，保持 `contracts.ts` 接口稳定，通过事件总线实现跨功能协作。

### 第一阶段：组织结构基础（其他功能的前置依赖）

1. **部门（Department）**
   - 新增 `departments` 表（id, name, parentId, managerId, description）
   - 给 `employee_profiles` 加 `departmentId` FK

2. **职位（Position）**
   - 新增 `positions` 表（id, title, departmentId, level, description）
   - 给 `employee_profiles` 加 `positionId` FK

3. **汇报关系**
   - 给 `employee_profiles` 加 `reportsToEmployeeId` FK
   - 或单独建 `job_assignments` 表以支持历史记录

### 第二阶段：合规文档（HR 合规最基础需求）

4. **劳动合同**
   - 新增 `employment_contracts` 表（关联 `employee_profiles`，含类型、签署日期、到期提醒）

5. **员工文件**
   - 新增 `employee_documents` 表（结构化管理证件、学历、资质文件）
   - 可复用 `documentIntakeModule` 的文件处理能力

### 第三阶段：考勤与休假

6. **休假管理**
   - 新增 `leave_policies` + `leave_entitlements` + `leave_requests` 表

7. **考勤记录**
   - 新增 `attendance_records` 表
   - 可扩展 `allocationMode: timesheet` 的现有逻辑

### 第四阶段：薪资工作流完善

8. **薪资单生成**
   - 在现有 `payout_records` 基础上新增 payslip 聚合逻辑和 PDF 导出

9. **审批流**
   - 扩展 `payout_records.status` 枚举为 `draft → pending_approval → confirmed → paid`

### 第五阶段：绩效与发展（后期）

10. **绩效考核**
    - 新增 `performance_cycles` + `performance_reviews` 表

11. **培训记录**
    - 新增 `training_programs` + `employee_training_records` 表

### 第六阶段：招聘（独立子模块）

12. **招聘管理**
    - 可作为独立模块 `recruitment` 注册
    - 入职时通过 `PersonService.createPerson()` 将候选人转化为正式员工

---

*本报告基于 2026-05-28 的代码快照生成，后续开发以此为基准进行扩展。*
