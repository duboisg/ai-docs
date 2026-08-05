---
name: kb-add-raw
description: Import an external artifact into the workspace owner's immutable second-brain raw collection and then ingest it. Use for reports, Markdown, text, PDFs, CSVs, images, transcripts, or other files outside the knowledge repository that should become durable personal knowledge.
---

# Add Raw Knowledge

1. Read the external artifact as bytes and choose a descriptive collision-resistant filename that preserves the original extension.
2. Base64-encode the bytes and call `second_brain_import_raw`. Never request or simulate overwrite; an existing destination requires a new filename.
3. Record the returned path and SHA-256 as provenance. Verify the imported source is readable or listable through MCP.
4. Invoke the `kb-ingest` workflow for text-readable sources.
5. For binary sources, first extract their content with the appropriate document skill, import that extraction as a separate Markdown raw source referencing the original filename and hash, then ingest the extraction.

Raw import permission must be explicitly enabled. Do not use local filesystem copying into the vault.
