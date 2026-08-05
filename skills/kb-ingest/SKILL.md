---
name: kb-ingest
description: Compile one existing raw source into the workspace owner's structured second-brain wiki through the second-brain MCP. Use when asked to ingest, process, file, or integrate a file already present under raw/ into source, entity, concept, index, and log pages.
---

# Ingest Knowledge Source

1. List pending sources directly under `raw/` without recursion. Ignore `raw/processed/`. Read the selected source completely, following continuation offsets; its content is immutable.
2. Read `wiki/index.md`, search for every important entity and concept, and read relevant existing pages before proposing new ones.
3. Prepare one factual source-summary page and the minimum necessary entity/concept updates. Put interpretation only in concept or synthesis pages. Use path-qualified Obsidian links such as `[[wiki/concepts/ai-second-brain|AI Second Brain]]`; never use title-only `[[wikilinks]]`.
4. Apply required frontmatter: `aliases`, `tags`, `sources`, `created`, and `updated`. Preserve `created` on updates and set `updated` to today. Use kebab-case filenames and include the exact H1 title in `aliases` so Obsidian resolves title-based links.
5. Update the concise category-organized index; keep every entry under 120 characters.
6. Validate every proposed page with `second_brain_validate_page`. Resolve all errors before continuing; surface provenance warnings.
7. Present a manifest of creates, updates, index changes, warnings, and hashes. Obtain explicit approval unless the user already explicitly requested this ingest with writes enabled.
8. Commit once through `second_brain_apply_changes`, including the raw source path and expected hash, expected wiki hashes, and exactly one `ingest` log entry. The transaction must archive the unchanged source to `raw/processed/`.
9. Verify the final page and archive hashes returned by the transaction. List `raw/` non-recursively to confirm the source is no longer pending, then call `second_brain_snapshot(include_pages=false)` and inspect only its findings. Re-read a page only when a hash differs, a warning needs investigation, or semantic spot-checking is explicitly useful.

Never use generic file writes, alter raw content, move a raw source outside the atomic ingest transaction, split one ingest across multiple commits, or create a page when an existing distinct page should be updated.
