import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectRepository,
	ProjectAttachmentRepository
} from '../repositories/project-repository';
import { NotFoundError } from '$platform/modules/errors';
import { ProjectPermissionError } from '../domain';
import type { ProjectAccessService } from './project-access-service';

/**
 * Project attachments (TKMGMT1 v2 — multi-file). Permission: collaborator-or-better.
 *
 * Future capability: `project.attachment`.
 */
export class ProjectAttachmentService {
	private repo: ProjectRepository;
	private attachmentRepo: ProjectAttachmentRepository;
	private access: ProjectAccessService;

	constructor(private ctx: ModuleContext, deps: { access: ProjectAccessService }) {
		this.repo = new ProjectRepository(ctx.db);
		this.attachmentRepo = new ProjectAttachmentRepository(ctx.db);
		this.access = deps.access;
	}

	/**
	 * Returns the canonical attachment list for the project. Includes any rows
	 * in `project_attachments` and synthesizes a virtual entry for the legacy
	 * single-file columns (`projects.attachment_url` / `_name`) when they're
	 * still populated — that way old data still renders, but new uploads always
	 * go through the multi-file table.
	 */
	async listAttachments(projectId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);

		const rows = await this.attachmentRepo.listForProject(projectId);
		const out = rows.map((row) => ({
			id: row.id,
			fileName: row.fileName,
			url: row.url,
			storageKey: row.storageKey,
			contentType: row.contentType ?? null,
			sizeBytes: row.sizeBytes ?? null,
			uploadedById: row.uploadedById ?? null,
			uploadedByEmail: row.uploadedByEmail ?? null,
			createdAt: row.createdAt,
			legacy: false
		}));

		// Legacy single-file fallback: render the old columns as a read-only
		// list entry. The UI treats it specially (no delete) so users can
		// re-upload it through the new flow at their leisure.
		if (project.attachmentUrl) {
			out.unshift({
				id: '__legacy__',
				fileName: project.attachmentName ?? 'Attachment',
				url: project.attachmentUrl,
				storageKey: '',
				contentType: null,
				sizeBytes: null,
				uploadedById: null,
				uploadedByEmail: null,
				createdAt: project.createdAt,
				legacy: true
			});
		}
		return out;
	}

	/**
	 * Insert an attachment row. The route is responsible for putting the bytes
	 * in R2 first; this service only persists the metadata.
	 *
	 * Permission: collaborator-or-better. TKMGMT2 lists attachments as
	 * non-crucial fields, so any collaborator may add / remove them.
	 */
	async addAttachment(input: {
		projectId: string;
		storageKey: string;
		url: string;
		fileName: string;
		contentType?: string | null;
		sizeBytes?: number | null;
	}) {
		const project = await this.repo.findById(input.projectId);
		if (!project) throw new NotFoundError('Project', input.projectId);

		const scope = this.access.scopeFor(project.ownerId);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may attach files to this project.'
			);
		}

		const user = this.ctx.user;
		const id = crypto.randomUUID();
		await this.attachmentRepo.create({
			id,
			projectId: input.projectId,
			storageKey: input.storageKey,
			url: input.url,
			fileName: input.fileName,
			contentType: input.contentType ?? null,
			sizeBytes: input.sizeBytes ?? null,
			uploadedById: user?.id ?? null,
			uploadedByEmail: user?.email ?? null
		});
		return {
			id,
			projectId: input.projectId,
			storageKey: input.storageKey,
			url: input.url,
			fileName: input.fileName,
			contentType: input.contentType ?? null,
			sizeBytes: input.sizeBytes ?? null,
			uploadedById: user?.id ?? null,
			uploadedByEmail: user?.email ?? null
		};
	}

	/**
	 * Soft-delete an attachment. The R2 object is intentionally left behind —
	 * a retention sweep job handles physical cleanup, consistent with the
	 * document-intake `abandonIntake` pattern (BaseLine §3.6).
	 *
	 * Returns `{ removed: boolean, storageKey: string | null }` so the route
	 * can decide whether to also delete the R2 object inline (we expose the
	 * key but don't delete here, to keep the service env-agnostic).
	 */
	async removeAttachment(projectId: string, attachmentId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);

		const scope = this.access.scopeFor(project.ownerId);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may remove attachments.'
			);
		}

		const row = await this.attachmentRepo.findOwnedByProject(projectId, attachmentId);
		if (!row) return { removed: false, storageKey: null as string | null };
		await this.attachmentRepo.softDelete(row.id);
		return { removed: true, storageKey: row.storageKey };
	}

	/**
	 * Clear the legacy single-file columns. Used by the UI when the user
	 * removes the synthesized "legacy" entry — actual `project_attachments`
	 * rows go through `removeAttachment` instead.
	 */
	async clearLegacyAttachment(projectId: string) {
		const project = await this.repo.findById(projectId);
		if (!project) throw new NotFoundError('Project', projectId);
		const scope = this.access.scopeFor(project.ownerId);
		if (scope === 'none') {
			throw new ProjectPermissionError(
				'Only owners, managers, or collaborators may remove attachments.'
			);
		}
		await this.repo.update(projectId, {
			attachmentUrl: null,
			attachmentName: null
		});
		return { removed: true };
	}
}
