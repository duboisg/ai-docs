---
name: kb-save-synthesis
description: Save a valuable cross-note answer or analysis as durable synthesis in the workspace owner's second-brain wiki. Use when the user asks to preserve, file, or save an analysis, comparison, conclusion, or decision produced from existing knowledge.
---

# Save Knowledge Synthesis

1. Confirm the material is cross-cutting interpretation rather than a raw source summary or a narrow entity update.
2. Search `wiki/synthesis` for an existing page and prefer updating it over creating a duplicate.
3. Read every cited wiki page and retain its source provenance. Clearly mark new inference.
4. Prepare a synthesis page with required frontmatter, kebab-case filename, and today's update date. Use path-qualified Obsidian links such as `[[wiki/concepts/ai-second-brain|AI Second Brain]]`, never title-only links, and include the exact H1 title in `aliases` for discovery.
5. Prepare the concise Synthesis index entry and exactly one `synthesis` log entry.
6. Validate the page, present the change manifest, and commit page plus index atomically through `second_brain_apply_changes` using expected hashes.
7. Re-read and verify the result.

Do not import new external evidence through this skill; use `kb-add-raw` followed by `kb-ingest`.
