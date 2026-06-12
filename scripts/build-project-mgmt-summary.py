"""
Build a bilingual (English + Chinese) Word summary of the Project Management
module work shipped on the `feature/Chamus-ProjMGMT` branch.

Run with:
    python scripts/build-project-mgmt-summary.py

Output:
    docs/Project-Management-Summary.docx
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Inches


OUTPUT = (
    Path(__file__).resolve().parent.parent
    / "ref_files"
    / "v4"
    / "Project-Management-Summary.docx"
)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

doc = Document()

# ---------------------------------------------------------------------------
# Document defaults
# ---------------------------------------------------------------------------
style = doc.styles["Normal"]
style.font.name = "Segoe UI"
style.font.size = Pt(10.5)

for sec in doc.sections:
    sec.left_margin = Inches(0.8)
    sec.right_margin = Inches(0.8)
    sec.top_margin = Inches(0.7)
    sec.bottom_margin = Inches(0.7)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
SF_GREEN = RGBColor(0x38, 0x72, 0x34)
INK = RGBColor(0x1A, 0x1A, 0x1A)
MUTED = RGBColor(0x47, 0x55, 0x69)


def h1(text: str) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(20)
    run.font.color.rgb = SF_GREEN


def h2(text: str) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(14)
    run.font.color.rgb = SF_GREEN
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(4)


def h3(text: str) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11.5)
    run.font.color.rgb = INK
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)


def para(text: str, italic: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = italic
    run.font.color.rgb = INK


def bullet(items: list[str], style_name: str = "List Bullet") -> None:
    for it in items:
        p = doc.add_paragraph(style=style_name)
        p.add_run(it)


def code(text: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.2)
    run = p.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(9.5)
    run.font.color.rgb = MUTED


def hr() -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run("─" * 60)
    run.font.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)


def kv_table(rows: list[tuple[str, str]]) -> None:
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Light Grid Accent 1"
    for i, (k, v) in enumerate(rows):
        c1, c2 = table.rows[i].cells
        c1.text = k
        c2.text = v
        for cell in (c1, c2):
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(9.5)
        for r in c1.paragraphs[0].runs:
            r.bold = True


# ---------------------------------------------------------------------------
# Cover
# ---------------------------------------------------------------------------
h1("SmartFin · Project Management Module")
para("feature/Chamus-ProjMGMT  ·  4 phases, 10 epics  ·  bilingual summary", italic=True)
para(
    "An end-to-end summary of the Project Management module redesign — what was "
    "shipped, how the project SDK is shaped, and how the AI capabilities plug "
    "into it. English first, Chinese second."
)
hr()


# ===========================================================================
#                                ENGLISH
# ===========================================================================

h2("1 · What was shipped (English)")

para(
    "The branch reshapes the Project Management module of SmartFin into a "
    "Motion-style workspace built on the same modular-monolith foundation as "
    "the existing finance / document-intake modules. The work landed in four "
    "phases, each its own commit."
)

h3("Phase 1 — Foundation")
bullet([
    "Auto-urgency colour helper computeUrgency(): one place to derive "
    "green / yellow / red from a project's deadline. Drives the list, detail "
    "page, dashboard, calendar, and Gantt bar colours. Replaces the manual "
    "1-10 priority picker — green > 70 % time remaining, yellow 20-70 %, red "
    "< 20 % or past deadline.",
    "Migration 0010 — four new tables: project_tasks, "
    "project_task_dependencies, project_workflow_stages, "
    "project_calendar_integrations.",
    "ProjectTaskService with full CRUD for tasks and dependencies, plus a "
    "longest-path critical-path resolver computed server-side.",
    "REST surface: /api/projects/[id]/tasks, /tasks/[taskId], "
    "/tasks/dependencies, /critical-path, /api/projects/gantt.",
    "/projects/gantt — server-rendered SVG portfolio chart with day / week / "
    "month / quarter scale, urgency-coloured bars showing completion %, "
    "inline drill-down to task bars, drag + resize, dependency arrows, "
    "highlighted critical path, today marker.",
])

h3("Phase 2 — AI layer")
bullet([
    "generateProjectPlan (Epic 1 · AI Project Manager) — natural-language "
    "prompt → editable JSON plan (tasks, durations, optional stages, "
    "dependencies, confidence). UI on /projects/new lets the user generate, "
    "edit, and commit; the detail page picks up the plan from sessionStorage "
    "and materialises tasks + deps through the REST API.",
    "summarizeDashboard (Epic 9 · AI Dashboards) — turns the dashboard "
    "numbers into an executive-tone brief plus severity-coloured risk chips.",
    "answerProjectQuestion (Epic 7 · AI Chat) — grounded Q&A about a single "
    "project. Floating widget on the detail page; replies carry citations "
    "and a needsHuman flag.",
    "extractTasksFromText (Epic 10 · Docs Assistant) — per-attachment "
    "button: pull raw text, propose tasks with confidence, promote the "
    "high-confidence ones into the task list.",
    "Workflow stages (Epic 3): GET / PUT / advance routes, stage data model "
    "already in migration 0010. Service auto-advances when every task on "
    "the current stage is completed.",
])

h3("Phase 3 — Resource awareness")
bullet([
    "ProjectAutoAssignService (Epic 4) — heuristic, workload-balanced "
    "auto-assign that scores collaborators by committed hours overlapping "
    "the task window and biases away from people over 60 h. Returns a "
    "rationale string for the UI.",
    "Google / Outlook OAuth scaffold (Epic 5) — start → callback → "
    "disconnect routes, full token exchange + refresh-token persistence in "
    "project_calendar_integrations. Provider creds are env-gated; the "
    "calendar page shows clean \"operator needs to set X\" copy when missing.",
])

h3("Phase 4 — Meeting AI")
bullet([
    "draftMeetingAgenda (Epic 6) — open tasks + recent comments in, a "
    "Zod-validated agenda with attendees and per-item minutes out.",
    "processMeetingTranscript (Epic 8) — operator pastes a transcript, AI "
    "returns summary + decisions + action items + risks. The bot-in-meeting "
    "variant (Zoom / Meet / Teams SDKs) accepts the same endpoint once that "
    "vendor integration is wired.",
])

h3("Polish")
bullet([
    "/projects/gantt is the primary landing for the Project tab.",
    "Motion-style \"Tasks scheduled past deadline\" popup auto-opens once "
    "per browser session if any project is in the overdue or urgent tier. "
    "Per-row +7 days / Mark done / This is fine actions.",
    "Multi-file drag-and-drop attachments on create and edit forms — new "
    "uploads never overwrite old files; soft-delete leaves R2 objects for a "
    "retention sweep.",
    "Project owner now resolved by getProjectShell() through a users join "
    "so the UI shows a name, not a raw user id.",
    "Modular boundary linter still passes after every commit.",
])


h2("2 · How the project SDK is shaped (English)")

para(
    "The project module follows the modular-monolith conventions documented "
    "in BaseLine §1 / §3 (ref_files/v4/BaseLine). Everything any caller "
    "needs sits behind a single public barrel — there are no deep imports "
    "from routes or other modules."
)

h3("Public barrel — $modules/project")
para(
    "src/modules/project/index.ts is the only public surface. It re-exports:"
)
bullet([
    "createProjectApi(ctx) — assembled in services/api.ts, returns the "
    "ProjectApi (read / write / collaborators / comments / attachments / "
    "dashboard / calendar / completeAndMaybeRecur).",
    "ProjectTaskService — class for the Gantt / task layer (CRUD, "
    "dependencies, critical-path, portfolio feed, stage auto-advance).",
    "ProjectAutoAssignService — workload-balanced assignee picker.",
    "ProjectCalendarIntegrationService — OAuth status / start / callback / "
    "disconnect for Google + Outlook.",
    "computeUrgency() pure helper + UrgencyLevel / UrgencyResult types.",
    "Five AI capabilities: generateProjectPlan, summarizeDashboard, "
    "answerProjectQuestion, extractTasksFromText, draftMeetingAgenda, "
    "processMeetingTranscript.",
    "Error classes ProjectPermissionError, ProjectValidationError, plus the "
    "ProjectCreateInput / ProjectUpdateInput / TaskCreateInput types so "
    "route handlers can type their payloads.",
])

h3("Internal layout")
kv_table([
    ("services/", "api.ts, project-service.ts, legacy-project-service.ts (main impl), task-service.ts, auto-assign.ts, calendar-integration.ts, urgency.ts"),
    ("repositories/", "project-repository.ts (projects, collaborators, comments, attachments, user directory) + task-repository.ts (tasks, deps, stages, calendar integrations)"),
    ("contracts/", "source.ts, inbound.ts — ProjectSource interface + V2 contracts"),
    ("adapters/legacy.ts", "Binds the legacy ProjectService class to the ProjectSource contract"),
    ("capabilities/", "generate-plan, summarize-dashboard, answer-question, extract-tasks, meeting-agenda, meeting-notes"),
    ("schema", "All tables in repositories/project.schema.ts, re-exported from $infrastructure/db/schema"),
])

h3("Permission model")
bullet([
    "Owner — single FK on projects.owner_id, set at creation. Only owner / "
    "manager (any user with role owner / admin / project_manager) may edit "
    "crucial fields (name, deadline, ownerId).",
    "Collaborator — row in project_collaborators; may edit non-crucial "
    "fields (description, notes, status, attachments) and post comments.",
    "getEditableScope(projectId) returns 'manager' | 'owner' | "
    "'collaborator' | 'none' so both routes and the UI can gate actions "
    "consistently.",
])

h3("REST surface (per project)")
code(
    "GET    /api/projects/gantt                        portfolio feed\n"
    "GET    /api/projects/dashboard                    dashboard payload\n"
    "GET    /api/projects/dashboard/summary            AI exec summary\n"
    "GET    /api/projects/calendar[?format=ics]        calendar / ICS\n"
    "POST   /api/projects/generate-plan                AI plan from prompt\n"
    "\n"
    "GET/POST   /api/projects/[id]/tasks               task list / create\n"
    "PATCH/DEL  /api/projects/[id]/tasks/[taskId]      drag/resize/delete\n"
    "POST/DEL   /api/projects/[id]/tasks/dependencies  add / remove arrow\n"
    "POST       /api/projects/[id]/tasks/auto-assign   workload picker\n"
    "GET        /api/projects/[id]/critical-path       longest-path resolver\n"
    "\n"
    "POST       /api/projects/[id]/chat                AI Q&A\n"
    "POST       /api/projects/[id]/extract-tasks       Docs Assistant\n"
    "POST       /api/projects/[id]/meeting-agenda      Meeting Assistant\n"
    "POST       /api/projects/[id]/meeting-notes       Meeting Notetaker\n"
    "POST       /api/projects/[id]/complete            mark done + recur\n"
    "GET/POST   /api/projects/[id]/comments\n"
    "GET/POST/DEL /api/projects/[id]/collaborators\n"
    "GET/POST/DEL /api/projects/[id]/attachments\n"
    "GET/PUT    /api/projects/[id]/stages              workflow stages\n"
    "POST       /api/projects/[id]/stages/advance      auto-advance check\n"
    "\n"
    "GET   /api/projects/calendar/integrations         OAuth status\n"
    "GET   /api/projects/calendar/oauth/[p]/start      → consent screen\n"
    "GET   /api/projects/calendar/oauth/[p]/callback   token exchange\n"
    "POST  /api/projects/calendar/oauth/[p]/disconnect"
)


h2("3 · SDK ↔ AI interaction (English)")

para(
    "Every AI capability follows the same shape so they share retry "
    "behaviour, schema validation, telemetry, and provider routing."
)

h3("The runtime contract")
para(
    "$platform/ai/ai-runtime.runStructuredOutput() takes a Zod schema and "
    "returns a typed value, auto-retries once on validation failure, and "
    "produces structured AIResultMetadata (provider id, model id, latency, "
    "tokens). It is the canonical AI call inside SmartFin — finance / "
    "document-intake / project all use it."
)

code(
    "const result = await runStructuredOutput({\n"
    "  task: 'project.generate-plan',\n"
    "  messages: [\n"
    "    { role: 'system', content: SYSTEM_PROMPT },\n"
    "    { role: 'user',   content: userContent }\n"
    "  ],\n"
    "  schema: GeneratedPlanSchema,            // ← Zod\n"
    "  schemaName: 'project.generated-plan',\n"
    "  schemaVersion: 'v1',\n"
    "  modelHint:  { capability: 'reasoning', priority: 'quality' },\n"
    "  metadata:   { tenantId, capabilityId, promptVersion, riskLevel },\n"
    "  env\n"
    "});"
)

h3("Capability shape")
para(
    "Each AI capability lives in a self-contained folder under "
    "src/modules/project/capabilities/<name>/:"
)
bullet([
    "schema.ts — Zod schema describing the LLM's required output.",
    "capability.ts — exports an async function (input, env) → { value, "
    "status }. Holds the system prompt, the user-content composition, and "
    "the runStructuredOutput call.",
    "index.ts — barrel re-export so $modules/project exposes the function "
    "and its types.",
])

h3("Why this split matters")
bullet([
    "Capabilities don't touch the database — they just transform text in / "
    "JSON out. The route or service is responsible for fetching the "
    "context bundle and writing back any results.",
    "The Zod schema is the trust boundary: malformed LLM output is rejected "
    "and retried automatically.",
    "Risk level is recorded in metadata.riskLevel (R0 read-only, R1 "
    "suggestion, ... R5 destructive). The platform capability registry can "
    "later refuse to run a capability above the user's authorised level.",
    "Because every capability obeys the same shape, swapping the underlying "
    "model (Workers AI ↔ external LLM ↔ a future BYOK key) is a single "
    "config change inside ai-runtime — no capability code changes.",
])

h3("End-to-end example — AI Project Manager")
bullet([
    "User types \"Renovate the beachfront restaurant by June\" into the prompt "
    "on /projects/new and clicks Generate plan.",
    "Browser POSTs /api/projects/generate-plan with the prompt and any "
    "known dates.",
    "Route handler calls generateProjectPlan(input, event.platform.env).",
    "The capability runs runStructuredOutput against the Zod plan schema. "
    "If output validation fails, the runtime retries once.",
    "Response returns { plan } to the browser; the create form is "
    "pre-filled with the project name + suggested tasks and the user can "
    "edit before submitting.",
    "On form submit the project is created via the normal POST "
    "/api/projects, then the detail page's onMount drains the stashed plan "
    "from sessionStorage and creates each task + dependency through the "
    "task routes.",
    "Result: AI is suggestive (proposed plan, editable preview, explicit "
    "submit) — never authoritative (never writes to the DB by itself).",
])

h3("AI feature surface")
kv_table([
    ("AI Project Manager", "generateProjectPlan → /api/projects/generate-plan"),
    ("AI Gantt portfolio", "GET /api/projects/gantt (deterministic, no LLM)"),
    ("AI Workflows", "POST /api/projects/[id]/stages/advance + auto-advance hook"),
    ("AI Task Manager", "ProjectAutoAssignService → /tasks/auto-assign (heuristic)"),
    ("AI Calendar", "calendar-integration.ts OAuth + ICS feed"),
    ("AI Meeting Assistant", "draftMeetingAgenda → /meeting-agenda"),
    ("AI Chat", "answerProjectQuestion → /chat (citations + needsHuman)"),
    ("AI Meeting Notetaker", "processMeetingTranscript → /meeting-notes"),
    ("AI Dashboards", "summarizeDashboard → /dashboard/summary"),
    ("AI Docs Assistant", "extractTasksFromText → /extract-tasks"),
])


hr()


# ===========================================================================
#                                中文
# ===========================================================================

h2("1 · 本次交付内容（中文）")

para(
    "本次改造把 SmartFin 的 Project Management 模块升级成一个 Motion 风格的"
    "项目工作台，依然遵循既有的模块化单仓（modular monolith）架构，与"
    "finance / document-intake 等模块同源同构。整套工作分四个阶段、四个独立"
    "提交完成。"
)

h3("Phase 1 — 基础设施")
bullet([
    "新增 computeUrgency() 纯函数：根据项目 deadline 自动计算绿 / 黄 / 红"
    "三色紧急度。列表页、详情页、Dashboard、Calendar、Gantt 全部使用同一处颜色"
    "逻辑——剩余时间 > 70% 绿色，20-70% 黄色，< 20% 或已逾期红色。原来 1-10 "
    "的手动 priority 输入被彻底移除。",
    "Migration 0010 新增四张表：project_tasks / project_task_dependencies / "
    "project_workflow_stages / project_calendar_integrations。",
    "ProjectTaskService 提供任务 + 依赖的完整 CRUD，并在服务端实现最长路径"
    "算法计算 critical path。",
    "REST 接口：/api/projects/[id]/tasks 等系列，以及组合视图"
    "/api/projects/gantt。",
    "/projects/gantt 页面：服务端渲染 SVG 甘特图，支持 day / week / month / "
    "quarter 四档缩放，行内展开看任务条，可拖拽 / 调整长度，依赖箭头，关键"
    "路径高亮，今日标尺。",
])

h3("Phase 2 — AI 能力层")
bullet([
    "generateProjectPlan（Epic 1 · AI 项目经理）：自然语言提示 → JSON 计划"
    "（任务、工期、可选阶段、依赖、置信度）。/projects/new 页面有 "
    "Generate plan 按钮，用户可以先看建议再提交，详情页 onMount 时从 "
    "sessionStorage 把任务和依赖写入数据库。",
    "summarizeDashboard（Epic 9 · AI Dashboard）：把状态计数 / 即将到期 / "
    "已逾期数据拼装成 LLM Prompt，输出一段高管口吻的 brief 与按严重程度上色"
    "的风险标签。",
    "answerProjectQuestion（Epic 7 · AI Chat）：基于单个项目的上下文回答"
    "自然语言问题。详情页右下角浮动小窗，回答自带引用与 needsHuman 标志。",
    "extractTasksFromText（Epic 10 · 文档助手）：每个附件旁边的"
    "「AI · Extract tasks」按钮，把高置信度的建议直接落到任务列表。",
    "Workflow 阶段（Epic 3）：GET / PUT / advance 三条接口，stage 数据模型"
    "在 migration 0010 已落地，全部阶段任务完成时自动推进。",
])

h3("Phase 3 — 资源感知")
bullet([
    "ProjectAutoAssignService（Epic 4）：基于启发式的工作量平衡——按"
    "「与新任务窗口重叠的已承诺工时」给协作者打分，超过 60 小时直接降权。"
    "返回 rationale 字符串供 UI 解释为什么挑了这个人。",
    "Google / Outlook OAuth 脚手架（Epic 5）：完整实现了 start → callback → "
    "disconnect 链路，token 与 refresh token 入库到 "
    "project_calendar_integrations。Provider 凭证由环境变量控制，缺失时"
    "Calendar 页面会显示「需要运维设置 GOOGLE_CALENDAR_CLIENT_ID + SECRET」"
    "的清晰提示，而不是 OAuth 一堆乱码。",
])

h3("Phase 4 — 会议 AI")
bullet([
    "draftMeetingAgenda（Epic 6）：输入项目的未完成任务与最近评论，输出经过"
    "Zod 校验的会议议程（标题、目标、与会人、每个议题分配的分钟数）。",
    "processMeetingTranscript（Epic 8）：用户粘贴 / 上传会议纪要文本，AI"
    "返回摘要、决议、责任人 + 截止日期的行动项、风险点。Zoom / Meet / Teams "
    "机器人入会的变体只需要把转录后的文本喂给同一个接口即可。",
])

h3("打磨细节")
bullet([
    "/projects/gantt 已成为 Project 顶部 Tab 的默认落地页。",
    "Motion 同款「Tasks scheduled past deadline」弹窗：当前会话内首次进入"
    "甘特图时，如果有逾期或紧急项目自动弹出。每行三个动作：+7 days（PATCH "
    "deadline）/ Mark done（POST complete）/ This is fine（本会话隐藏）。",
    "创建 / 编辑表单都支持多文件拖拽上传，新文件不会覆盖旧文件，软删除后 "
    "R2 中的原文件由 retention 清扫任务统一处理。",
    "项目所有者通过 getProjectShell() 关联 users 表，前端展示名字而不是"
    "用户 ID。",
    "每次提交后模块边界 linter 全部通过。",
])


h2("2 · 项目 SDK 定义方式（中文）")

para(
    "Project 模块严格遵循 BaseLine §1 / §3 描述的模块化单仓约定（位于 "
    "ref_files/v4/BaseLine）。任何调用方只需要走一个公共 barrel，禁止从"
    "路由或别的模块深层 import。"
)

h3("公共 barrel — $modules/project")
para(
    "src/modules/project/index.ts 是唯一的公开入口，对外暴露："
)
bullet([
    "createProjectApi(ctx) — 在 services/api.ts 装配，返回 ProjectApi"
    "（读 / 写 / 协作者 / 评论 / 附件 / Dashboard / Calendar / 自动续期等"
    "全部方法）。",
    "ProjectTaskService — 甘特图 / 任务层的核心类（CRUD、依赖、关键路径、"
    "组合视图、阶段自动推进）。",
    "ProjectAutoAssignService — 基于负载平衡的任务自动分配。",
    "ProjectCalendarIntegrationService — Google / Outlook 的 OAuth 状态 / "
    "start / callback / disconnect。",
    "computeUrgency() 纯函数 + UrgencyLevel / UrgencyResult 类型。",
    "五个 AI 能力：generateProjectPlan、summarizeDashboard、"
    "answerProjectQuestion、extractTasksFromText、draftMeetingAgenda、"
    "processMeetingTranscript。",
    "错误类型 ProjectPermissionError / ProjectValidationError，以及 "
    "ProjectCreateInput / ProjectUpdateInput / TaskCreateInput 输入类型，"
    "便于路由层做类型化校验。",
])

h3("内部目录")
kv_table([
    ("services/", "api.ts、project-service.ts、legacy-project-service.ts（主实现）、task-service.ts、auto-assign.ts、calendar-integration.ts、urgency.ts"),
    ("repositories/", "project-repository.ts（项目、协作者、评论、附件、用户目录）+ task-repository.ts（任务、依赖、阶段、日历集成）"),
    ("contracts/", "source.ts、inbound.ts — ProjectSource 接口 + V2 契约"),
    ("adapters/legacy.ts", "把 legacy ProjectService 装配进 ProjectSource 契约"),
    ("capabilities/", "generate-plan、summarize-dashboard、answer-question、extract-tasks、meeting-agenda、meeting-notes"),
    ("schema", "所有表定义在 repositories/project.schema.ts，并通过 $infrastructure/db/schema 统一 re-export"),
])

h3("权限模型")
bullet([
    "Owner — projects.owner_id 单值外键，创建时设定。只有 Owner / "
    "Manager（owner / admin / project_manager 角色）可以修改关键字段"
    "（name / deadline / ownerId）。",
    "Collaborator — project_collaborators 中的一行，可以修改非关键字段"
    "（description / notes / status / attachments）并发表评论。",
    "getEditableScope(projectId) 返回 'manager' | 'owner' | 'collaborator' | "
    "'none'，路由层与 UI 层一致地用它来 gate 行为。",
])

h3("REST 接口一览（单一项目）")
code(
    "GET    /api/projects/gantt                        组合甘特数据\n"
    "GET    /api/projects/dashboard                    Dashboard 数据\n"
    "GET    /api/projects/dashboard/summary            AI 高管摘要\n"
    "GET    /api/projects/calendar[?format=ics]        日历 / ICS\n"
    "POST   /api/projects/generate-plan                AI 生成计划\n"
    "\n"
    "GET/POST   /api/projects/[id]/tasks               任务列表 / 创建\n"
    "PATCH/DEL  /api/projects/[id]/tasks/[taskId]      拖拽 / 缩放 / 删除\n"
    "POST/DEL   /api/projects/[id]/tasks/dependencies  添加 / 移除依赖\n"
    "POST       /api/projects/[id]/tasks/auto-assign   自动分配\n"
    "GET        /api/projects/[id]/critical-path       最长路径\n"
    "\n"
    "POST       /api/projects/[id]/chat                AI 问答\n"
    "POST       /api/projects/[id]/extract-tasks       文档助手\n"
    "POST       /api/projects/[id]/meeting-agenda      会议助手\n"
    "POST       /api/projects/[id]/meeting-notes       会议记录\n"
    "POST       /api/projects/[id]/complete            标记完成（+ 续期）\n"
    "GET/POST   /api/projects/[id]/comments\n"
    "GET/POST/DEL /api/projects/[id]/collaborators\n"
    "GET/POST/DEL /api/projects/[id]/attachments\n"
    "GET/PUT    /api/projects/[id]/stages              Workflow 阶段\n"
    "POST       /api/projects/[id]/stages/advance      自动推进\n"
    "\n"
    "GET   /api/projects/calendar/integrations         OAuth 状态\n"
    "GET   /api/projects/calendar/oauth/[p]/start      → 授权页\n"
    "GET   /api/projects/calendar/oauth/[p]/callback   token 兑换\n"
    "POST  /api/projects/calendar/oauth/[p]/disconnect"
)


h2("3 · SDK 与 AI 的交互方式（中文）")

para(
    "所有 AI 能力共用同一个签名形状，因此重试、schema 校验、埋点、模型路由"
    "都是一致的——单点改动可以同时影响所有能力。"
)

h3("运行时契约")
para(
    "$platform/ai/ai-runtime.runStructuredOutput() 接受一个 Zod schema，"
    "返回有类型的对象。如果 LLM 输出不满足 schema，会自动重试一次，并产生"
    "AIResultMetadata（provider id / model id / 时延 / token 数）。这是 "
    "SmartFin 内部唯一的 AI 调用入口，Finance、Document-Intake、Project "
    "全部走它。"
)

code(
    "const result = await runStructuredOutput({\n"
    "  task: 'project.generate-plan',\n"
    "  messages: [\n"
    "    { role: 'system', content: SYSTEM_PROMPT },\n"
    "    { role: 'user',   content: userContent }\n"
    "  ],\n"
    "  schema: GeneratedPlanSchema,            // ← Zod\n"
    "  schemaName: 'project.generated-plan',\n"
    "  schemaVersion: 'v1',\n"
    "  modelHint:  { capability: 'reasoning', priority: 'quality' },\n"
    "  metadata:   { tenantId, capabilityId, promptVersion, riskLevel },\n"
    "  env\n"
    "});"
)

h3("Capability 的结构约定")
para("每个 AI 能力一个独立目录：src/modules/project/capabilities/<name>/")
bullet([
    "schema.ts — 描述 LLM 必须返回的形状（Zod）。",
    "capability.ts — async (input, env) → { value, status }。其中包含"
    "System Prompt、User content 组装、runStructuredOutput 调用。",
    "index.ts — barrel 重新导出，使 $modules/project 顶层就能暴露函数 + "
    "类型。",
])

h3("为什么这样切分")
bullet([
    "Capability 不直接访问数据库——它只做「文本进 → JSON 出」。把数据库 "
    "fetch / 写入留给 Route 或 Service，避免单测和回放变复杂。",
    "Zod schema 是信任边界：模型乱写直接被拒，自动重试，不会污染下游业务"
    "数据。",
    "metadata.riskLevel 记录 R0（只读）到 R5（破坏性）的风险等级。后续 "
    "platform 的 capability registry 可以根据用户授权拒绝执行高风险能力。",
    "由于所有 capability 形状一致，更换模型（Workers AI ↔ 外部 LLM ↔ 未来"
    "的 BYOK key）只是 ai-runtime 内部的一次配置改动，capability 代码不动。",
])

h3("端到端举例：AI Project Manager")
bullet([
    "用户在 /projects/new 的提示框写下「Renovate the beachfront restaurant "
    "by June」并点 Generate plan。",
    "浏览器 POST /api/projects/generate-plan，带上 prompt 与已知日期。",
    "路由调用 generateProjectPlan(input, event.platform.env)。",
    "能力内部调 runStructuredOutput 走 Zod 计划 schema。如果输出无效自动"
    "重试一次。",
    "返回 { plan } 给浏览器，表单回填项目名、任务列表，用户可以修改后再"
    "提交。",
    "表单提交走原本的 POST /api/projects 创建项目；详情页 onMount 把暂存在"
    "sessionStorage 的计划逐条调任务 + 依赖接口落库。",
    "结果：AI 只「建议」（提案、可编辑预览、显式提交）——绝对不会自己写库。",
])

h3("AI 能力清单一览")
kv_table([
    ("AI Project Manager", "generateProjectPlan → /api/projects/generate-plan"),
    ("AI Gantt 组合视图", "GET /api/projects/gantt（确定性算法，无 LLM）"),
    ("AI Workflows", "POST /api/projects/[id]/stages/advance + 自动推进 hook"),
    ("AI Task Manager", "ProjectAutoAssignService → /tasks/auto-assign（启发式）"),
    ("AI Calendar", "calendar-integration.ts OAuth + ICS 订阅"),
    ("AI Meeting Assistant", "draftMeetingAgenda → /meeting-agenda"),
    ("AI Chat", "answerProjectQuestion → /chat（引用 + needsHuman 标志）"),
    ("AI Meeting Notetaker", "processMeetingTranscript → /meeting-notes"),
    ("AI Dashboards", "summarizeDashboard → /dashboard/summary"),
    ("AI Docs Assistant", "extractTasksFromText → /extract-tasks"),
])

hr()
para(
    "Generated automatically by scripts/build-project-mgmt-summary.py — "
    "re-run that script after any further changes to keep the doc in sync.",
    italic=True,
)


# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------
doc.save(OUTPUT)
print(f"Wrote {OUTPUT}")
