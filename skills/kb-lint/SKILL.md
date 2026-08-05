---
name: kb-lint
description: Health-check the workspace owner's Markdown second brain through the second-brain MCP. Use when asked to lint, audit, validate, repair, or find contradictions, stale claims, orphans, broken links, missing concepts, weak provenance, or knowledge gaps.
---

# Lint Second Brain

Keep deterministic structure checks separate from semantic judgment.

1. Call `second_brain_snapshot` repeatedly until `next_cursor` is null. Retain its revision and every structural finding.
2. Report schema, index, broken-link, orphan, missing-source, naming, and date findings as deterministic MCP results.
3. Read pages implicated by findings and a focused sample of related pages. Search for newer or competing claims.
4. Judge possible contradictions, superseded claims, weak support, near-duplicates, missing concepts, missing cross-references, and research gaps. Label these as semantic findings, not certainties.
5. Produce a dated Markdown report under `output/lint-YYYY-MM-DD.md` only when output writes are enabled. Otherwise return the complete report in chat.
6. Append one `lint` log entry only when the host permits wiki updates. Never repair wiki pages during the initial lint pass.
7. Offer a concrete repair set and wait for explicit authorization before invoking any write workflow.

Search cannot replace complete snapshot traversal. Never delete pages during lint.
