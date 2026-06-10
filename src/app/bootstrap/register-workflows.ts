/**
 * Application composition root for workflow-definition registration.
 *
 * Platform owns the engine + registry; concrete workflow definitions are
 * selected here so platform never imports domain modules. This is also the one
 * legitimate place for cross-module wiring: finance's `field_extraction` step
 * needs document-intake's OCR text, injected here via `loadDocumentText` (the
 * same inversion-of-control document-intake uses for finance's extractor).
 */
import { buildFinanceWorkflowDefinitions } from '$modules/finance';
import { createDocumentIntakeService } from '$modules/document-intake';
import { registerWorkflow } from '$platform/workflow/workflow-registry';

const financeWorkflowDefinitions = buildFinanceWorkflowDefinitions({
	async loadDocumentText({ documentId, tenantId, env, db, user }) {
		try {
			const docService = createDocumentIntakeService({ db, env, user });
			const artifact = await docService.getDocumentArtifact({ tenantId, documentId });
			if (artifact?.textExtraction?.status === 'success') {
				return {
					text: artifact.textExtraction.text,
					confidence: artifact.textExtraction.confidence
				};
			}
		} catch {
			// Treat as missing text; the extraction capability falls back to its fixture.
		}
		return {};
	}
});

for (const definition of financeWorkflowDefinitions) {
	registerWorkflow(definition);
}
