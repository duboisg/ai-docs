from __future__ import annotations

from functools import lru_cache
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from .service import SecondBrainConfig, SecondBrainService


mcp = FastMCP(
    "Second Brain",
    instructions=(
        "Guarded access to the workspace owner's Markdown second brain. Search wiki/ before raw/. "
        "Never alter raw source content. Successful ingests may atomically archive a source under "
        "raw/processed/ when explicitly enabled by the host."
    ),
)


@lru_cache(maxsize=1)
def get_service() -> SecondBrainService:
    return SecondBrainService(SecondBrainConfig.from_env())


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_info() -> dict[str, Any]:
    """Describe the configured second brain and its current write policy."""
    return get_service().info()


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_list(
    path: str = "wiki",
    recursive: bool = False,
    max_results: int = 200,
    cursor: int = 0,
    categories: list[str] | None = None,
) -> dict[str, Any]:
    """List files with knowledge metadata and cursor pagination."""
    return get_service().list_files(path, recursive=recursive, max_results=max_results,
                                    cursor=cursor, categories=categories)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_read(path: str, max_characters: int = 100_000, offset: int = 0) -> dict[str, Any]:
    """Read a page with parsed metadata, links, hash, and continuation offset."""
    return get_service().read(path, max_characters=max_characters, offset=offset)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_search(
    query: str,
    area: str = "wiki",
    max_results: int = 20,
    cursor: int = 0,
    categories: list[str] | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Ranked lexical search. Search wiki first; use raw only if needed."""
    return get_service().search(query, area=area, max_results=max_results, cursor=cursor,
                                categories=categories, tags=tags)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_snapshot(
    cursor: int = 0,
    max_results: int = 200,
    categories: list[str] | None = None,
    include_pages: bool = True,
) -> dict[str, Any]:
    """Return graph metadata and lint findings; omit page payloads for compact verification."""
    return get_service().snapshot(cursor=cursor, max_results=max_results, categories=categories,
                                  include_pages=include_pages)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False))
def second_brain_validate_page(path: str, content: str | None = None) -> dict[str, Any]:
    """Validate an existing or proposed wiki page without writing it."""
    return get_service().validate_page(path, content)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False))
def second_brain_write_page(
    path: str,
    content: str,
    expected_sha256: str | None = None,
) -> dict[str, Any]:
    """Create or revision-safely update one validated Markdown page."""
    return get_service().write_page(path, content, expected_sha256=expected_sha256)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False))
def second_brain_apply_changes(
    creates: list[dict[str, str]],
    updates: list[dict[str, str]],
    index_content: str,
    index_expected_sha256: str,
    log_title: str,
    log_description: str,
    log_operation: str,
    raw_source_path: str | None = None,
    raw_expected_sha256: str | None = None,
) -> dict[str, Any]:
    """Atomically commit validated wiki changes and optionally archive the ingested raw source."""
    return get_service().apply_changes(
        creates=creates, updates=updates, index_content=index_content,
        index_expected_sha256=index_expected_sha256, log_title=log_title,
        log_description=log_description, log_operation=log_operation,
        raw_source_path=raw_source_path, raw_expected_sha256=raw_expected_sha256,
    )


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False))
def second_brain_import_raw(filename: str, content_base64: str) -> dict[str, Any]:
    """Create one immutable raw source from base64 content; never overwrite."""
    return get_service().import_raw(filename, content_base64=content_base64)


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False))
def second_brain_append_log(
    title: str,
    description: str,
    operation: str = "note",
) -> dict[str, Any]:
    """Append a dated entry to wiki/log.md without editing existing entries."""
    return get_service().append_log(title, description, operation=operation)


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
