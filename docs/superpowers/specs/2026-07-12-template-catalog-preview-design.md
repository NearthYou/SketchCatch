# Template Catalog Preview Design

## Goal

Make every Template use the same ResourceItem definitions that users drag from the Workspace resource panel, and replace illegible text-chip gallery previews with concise, icon-based architecture previews.

## Problem

Before this change, the Template library built DiagramJson nodes from raw Terraform type strings. That bypassed `resourceCatalog`, so nodes lost their AWS icon, palette defaults, and resource-kind semantics. The Workspace fell back to generic cube tiles and the gallery rendered tiny label chips that overlapped for dense templates.

## Scope

- Materialize every built-in and repository-selected Template node through the web resource catalog.
- Preserve Template-specific identity, position, label, relationships, Terraform values, and deliberately oversized area layouts.
- Hydrate catalog-known legacy nodes when an existing Workspace draft is opened.
- Render gallery previews with actual ResourceItem icon URLs, area frames, edges, and a bounded set of meaningful nodes.
- Fail Template materialization with a named Terraform identity when a required catalog item is absent; do not silently draw a generic replacement.

## Design

`apps/web/features/resource-settings/template-resource-materializer.ts` owns the seam between a stored `DiagramJson` and the left-panel catalog. For a node whose Terraform block type and resource type resolve to a `ResourceItem`, it creates the palette-equivalent node with `createDiagramNodeFromPayload`, then overlays the Template's stable ID, label, position, explicit relationships metadata, Terraform parameters, and any intentionally larger area geometry. Strict materialization is used when a Template is created; tolerant hydration is used for old drafts so unrelated unknown nodes remain untouched.

The Template library materializes both legacy BoardTemplate definitions and the DiagramJson produced from shared `TemplateDefinition`s. `WorkspaceProjectClient` hydrates loaded drafts before first render.

`TemplateGallery` renders a small SVG architecture model rather than absolutely positioned text labels. It displays area frames, resource icon tiles, and only edges whose endpoints are visible. Dense templates omit collapsed implementation helpers, cap the preview at a fixed number of primary nodes, and show a compact overflow count.

## Resource Availability

No additional assets are required. The S3 static-site Template's Bucket, Object, Public Access Block, Bucket Policy, CloudFront OAC, and CloudFront Distribution already exist in `resourceCatalog`, along with the resources used by the remaining built-in templates.

## Acceptance Criteria

- A Template-created S3 Bucket and CloudFront Distribution have the same `iconUrl` and resource kind as their Workspace palette counterparts.
- All built-in and repository-selected Template nodes resolve through the catalog or fail with an explicit missing catalog identity.
- Existing catalog-known draft nodes with a missing `iconUrl` show their catalog icon when the Workspace opens.
- Gallery cards contain no rendered raw node-label chips; they display icon-based previews and do not render more than the bounded number of primary nodes.
- Template-specific Terraform values, edge IDs, node IDs, labels, positions, and intentionally larger area dimensions remain intact.
