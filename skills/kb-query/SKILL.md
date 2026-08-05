---
name: kb-query
description: Query the workspace owner's persistent second brain through the second-brain MCP. Use for questions about prior research, saved sources, decisions, projects, preferences, people, or cross-note synthesis, including requests such as "what do I know about", "find where I discussed", and "compare my notes".
---

# Query Second Brain

Use only `second_brain_*` MCP tools; do not open the knowledge repository through the local filesystem.

1. Call `second_brain_search` in `wiki` with the user's natural-language topic. For broad catalog questions, read `wiki/index.md` first.
2. Read the best pages fully, following `next_offset` until complete. Follow relevant returned wikilinks when they materially affect the answer.
3. Search or read `raw/` only when the wiki lacks necessary detail or an original claim needs verification. Say why raw access was needed.
4. Distinguish source-backed facts, existing wiki synthesis, and new inference.
5. Cite internal knowledge as `[[Page Title]]` plus the MCP-returned path. Never treat an empty result as proof of absence.
6. If the result is durable and cross-cutting, offer to use `kb-save-synthesis`; do not write as part of this skill.

Prefer targeted retrieval over reading the entire vault. For comparisons, retrieve each side independently before synthesizing.
