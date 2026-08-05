from pathlib import Path
import base64
import os

import pytest

from second_brain_mcp.service import SecondBrainConfig, SecondBrainError, SecondBrainService


@pytest.fixture()
def brain(tmp_path: Path) -> Path:
    for area in ("raw", "wiki"):
        (tmp_path / area).mkdir()
    (tmp_path / "wiki" / "index.md").write_text("# Index\n\nAgentic second brain\n", encoding="utf-8")
    (tmp_path / "raw" / "source.md").write_text("Google Workspace MCP\n", encoding="utf-8")
    return tmp_path


def service(brain: Path, *, writes: bool = False, raw_archives: bool = False) -> SecondBrainService:
    return SecondBrainService(
        SecondBrainConfig(
            root=brain,
            writes_enabled=writes,
            allow_raw_archives=raw_archives,
        )
    )


def test_search_defaults_to_wiki(brain: Path) -> None:
    result = service(brain).search("agentic brain")
    assert result["count"] == 1
    assert result["results"][0]["path"] == "wiki/index.md"


def test_read_rejects_escape(brain: Path) -> None:
    with pytest.raises(SecondBrainError, match="begin with"):
        service(brain).read("../secret.md")


def test_raw_is_never_writable(brain: Path) -> None:
    with pytest.raises(SecondBrainError, match="begin with"):
        service(brain, writes=True).write_page("raw/new.md", "no")


def test_writes_are_disabled_by_default(brain: Path) -> None:
    with pytest.raises(SecondBrainError, match="creates are disabled"):
        service(brain).write_page("wiki/concepts/new.md", valid_page())


def test_atomic_wiki_write(brain: Path) -> None:
    result = service(brain, writes=True).write_page(
        "wiki/concepts/new.md",
        "---\ntags: [test]\nsources: [source.md]\ncreated: 2026-07-11\nupdated: 2026-07-11\n---\n\n# New\n",
    )
    assert result["operation"] == "created"
    assert "# New" in (brain / "wiki" / "concepts" / "new.md").read_text(encoding="utf-8")


def test_update_requires_expected_hash(brain: Path) -> None:
    with pytest.raises(SecondBrainError, match="expected_sha256"):
        service(brain, writes=True).write_page("wiki/index.md", "replacement")


def test_append_log_preserves_existing_content(brain: Path) -> None:
    log = brain / "wiki" / "log.md"
    log.write_text("# Log\n", encoding="utf-8")
    service(brain, writes=True).append_log("MCP created", "Initial server.", operation="build")
    content = log.read_text(encoding="utf-8")
    assert content.startswith("# Log\n")
    assert "build | MCP created" in content


def valid_page(title: str = "New Concept") -> str:
    return (
        "---\n"
        f"aliases: [{title}]\n"
        "tags: [test]\n"
        "sources: [source.md]\n"
        "created: 2026-07-11\n"
        "updated: 2026-07-11\n"
        "---\n\n"
        f"# {title}\n\nAgentic second brain with [[wiki/concepts/other-concept|Other Concept]].\n"
    )


def test_read_returns_metadata_hash_links_and_continuation(brain: Path) -> None:
    page = brain / "wiki" / "concepts" / "new-concept.md"
    page.parent.mkdir()
    page.write_text(valid_page(), encoding="utf-8")
    result = service(brain).read("wiki/concepts/new-concept.md", max_characters=20)
    assert result["title"] == "New Concept"
    assert result["links"] == ["wiki/concepts/other-concept"]
    assert len(result["sha256"]) == 64
    assert result["next_offset"] == 20


def test_list_paginates_without_false_truncation(brain: Path) -> None:
    for number in range(3):
        path = brain / "wiki" / "concepts" / f"page-{number}.md"
        path.parent.mkdir(exist_ok=True)
        path.write_text(valid_page(f"Page {number}"), encoding="utf-8")
    first = service(brain).list_files("wiki", recursive=True, max_results=2)
    second = service(brain).list_files("wiki", recursive=True, max_results=10, cursor=2)
    assert first["next_cursor"] == 2
    assert second["next_cursor"] is None


def test_compact_snapshot_omits_page_payloads(brain: Path) -> None:
    result = service(brain).snapshot(include_pages=False)
    assert set(result) == {"path", "total", "revision", "findings"}
    assert result["path"] == "wiki"
    assert result["total"] == 1


def test_snapshot_recognizes_canonical_index_target(brain: Path) -> None:
    concepts = brain / "wiki" / "concepts"
    concepts.mkdir()
    (concepts / "new-concept.md").write_text(valid_page(), encoding="utf-8")
    (brain / "wiki" / "index.md").write_text(
        "# Index\n\n- [[wiki/concepts/new-concept|New Concept]] - Test.\n",
        encoding="utf-8",
    )
    findings = service(brain).snapshot(include_pages=False)["findings"]
    assert not any(item["check"] == "index" and item["path"].endswith("new-concept.md") for item in findings)


def test_validate_rejects_missing_frontmatter(brain: Path) -> None:
    result = service(brain).validate_page("wiki/concepts/bad-page.md", "# Bad Page\n")
    assert not result["valid"]
    assert "Missing frontmatter fields" in result["errors"][0]


def test_validate_requires_title_alias_when_filename_differs(brain: Path) -> None:
    content = valid_page().replace("aliases: [New Concept]\n", "")
    result = service(brain).validate_page("wiki/concepts/new-concept.md", content)
    assert not result["valid"]
    assert any("H1 title must appear" in error for error in result["errors"])


def test_validate_rejects_title_only_wikilink(brain: Path) -> None:
    content = valid_page().replace(
        "[[wiki/concepts/other-concept|Other Concept]]", "[[Other Concept]]"
    )
    result = service(brain).validate_page("wiki/concepts/new-concept.md", content)
    assert not result["valid"]
    assert any("canonical wiki path" in error for error in result["errors"])


def test_snapshot_resolves_alias_and_rejects_title_only_link(brain: Path) -> None:
    concepts = brain / "wiki" / "concepts"
    concepts.mkdir()
    (concepts / "new-concept.md").write_text(valid_page(), encoding="utf-8")
    linked = valid_page("Linked Page").replace(
        "[[wiki/concepts/other-concept|Other Concept]]",
        "[[wiki/concepts/new-concept|New Concept]]",
    )
    (concepts / "linked-page.md").write_text(linked, encoding="utf-8")
    findings = service(brain).snapshot(include_pages=False)["findings"]
    assert not any(item["check"] == "broken-link" and item["message"].endswith("new-concept") for item in findings)

    (concepts / "new-concept.md").write_text(
        valid_page().replace("aliases: [New Concept]\n", ""), encoding="utf-8"
    )
    findings = service(brain).snapshot(include_pages=False)["findings"]
    assert not any(item["check"] == "broken-link" and item["message"].endswith("new-concept") for item in findings)


def test_snapshot_reports_duplicate_alias_as_ambiguous(brain: Path) -> None:
    concepts = brain / "wiki" / "concepts"
    concepts.mkdir()
    (concepts / "first.md").write_text(valid_page("Shared"), encoding="utf-8")
    (concepts / "second.md").write_text(valid_page("Shared"), encoding="utf-8")
    findings = service(brain).snapshot(include_pages=False)["findings"]
    assert any(item["check"] == "ambiguous-link-target" for item in findings)


def test_ranked_search_supports_metadata_filters(brain: Path) -> None:
    page = brain / "wiki" / "concepts" / "new-concept.md"
    page.parent.mkdir()
    page.write_text(valid_page(), encoding="utf-8")
    result = service(brain).search("second brain", categories=["concepts"], tags=["test"])
    assert result["results"][0]["path"] == "wiki/concepts/new-concept.md"
    assert result["search_mode"] == "fts5-bm25"


def test_raw_import_is_create_only(brain: Path) -> None:
    svc = SecondBrainService(SecondBrainConfig(root=brain, allow_raw_imports=True))
    encoded = base64.b64encode(b"source").decode("ascii")
    result = svc.import_raw("imported.md", content_base64=encoded)
    assert result["path"] == "raw/imported.md"
    with pytest.raises(SecondBrainError, match="immutable"):
        svc.import_raw("imported.md", content_base64=encoded)


def test_update_requires_matching_hash(brain: Path) -> None:
    page = brain / "wiki" / "concepts" / "new-concept.md"
    page.parent.mkdir()
    page.write_text(valid_page(), encoding="utf-8")
    with pytest.raises(SecondBrainError, match="expected_sha256"):
        service(brain, writes=True).write_page("wiki/concepts/new-concept.md", valid_page("Changed"))


def test_transaction_updates_pages_index_and_log(brain: Path) -> None:
    index_hash = service(brain).read("wiki/index.md")["sha256"]
    result = service(brain, writes=True).apply_changes(
        creates=[{"path": "wiki/concepts/new-concept.md", "content": valid_page()}],
        updates=[],
        index_content="# Index\n\n- [[wiki/concepts/new-concept|New Concept]] - Test concept.\n",
        index_expected_sha256=index_hash,
        log_title="New Concept",
        log_description="Ingested test concept.",
        log_operation="ingest",
    )
    assert result["transaction_id"]
    assert (brain / "wiki" / "concepts" / "new-concept.md").is_file()
    assert "[[wiki/concepts/new-concept|New Concept]]" in (brain / "wiki" / "index.md").read_text(encoding="utf-8")
    assert "ingest | New Concept" in (brain / "wiki" / "log.md").read_text(encoding="utf-8")


def test_transaction_can_migrate_log_content_before_appending(brain: Path) -> None:
    log = brain / "wiki" / "log.md"
    log.write_text("# Log\n\nLegacy [[Old Title]].\n", encoding="utf-8")
    index_hash = service(brain).read("wiki/index.md")["sha256"]
    log_hash = service(brain).read("wiki/log.md")["sha256"]
    service(brain, writes=True).apply_changes(
        creates=[],
        updates=[{
            "path": "wiki/log.md",
            "content": "# Log\n\nLegacy [[wiki/concepts/old-title|Old Title]].\n",
            "expected_sha256": log_hash,
        }],
        index_content="# Index\n",
        index_expected_sha256=index_hash,
        log_title="Canonical links",
        log_description="Migrated the log.",
        log_operation="lint",
    )
    content = log.read_text(encoding="utf-8")
    assert "[[wiki/concepts/old-title|Old Title]]" in content
    assert "lint | Canonical links" in content


def test_transaction_archives_processed_raw_source(brain: Path) -> None:
    svc = service(brain, writes=True, raw_archives=True)
    source_hash = svc.read("raw/source.md")["sha256"]
    index_hash = svc.read("wiki/index.md")["sha256"]
    result = svc.apply_changes(
        creates=[{"path": "wiki/concepts/new-concept.md", "content": valid_page()}],
        updates=[],
        index_content="# Index\n\n- [[wiki/concepts/new-concept|New Concept]] - Test concept.\n",
        index_expected_sha256=index_hash,
        log_title="New Concept",
        log_description="Ingested test concept.",
        log_operation="ingest",
        raw_source_path="raw/source.md",
        raw_expected_sha256=source_hash,
    )
    assert not (brain / "raw" / "source.md").exists()
    archived = brain / "raw" / "processed" / "source.md"
    assert archived.read_text(encoding="utf-8") == "Google Workspace MCP\n"
    assert result["raw_archive"]["path"] == "raw/processed/source.md"
    assert result["raw_archive"]["sha256"] == source_hash
    assert {item["path"] for item in result["changes"]} == {
        "wiki/concepts/new-concept.md", "wiki/index.md", "wiki/log.md"
    }
    assert svc.list_files("raw", recursive=False)["files"] == []


def test_raw_archive_requires_matching_hash(brain: Path) -> None:
    index_hash = service(brain).read("wiki/index.md")["sha256"]
    with pytest.raises(SecondBrainError, match="Revision conflict"):
        service(brain, writes=True, raw_archives=True).apply_changes(
            creates=[], updates=[], index_content="# Index\n",
            index_expected_sha256=index_hash, log_title="Source",
            log_description="Should fail.", log_operation="ingest",
            raw_source_path="raw/source.md", raw_expected_sha256="bad",
        )


def test_transaction_rolls_back_on_publish_failure(brain: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    original_index = (brain / "wiki" / "index.md").read_text(encoding="utf-8")
    svc = service(brain, writes=True, raw_archives=True)
    index_hash = svc.read("wiki/index.md")["sha256"]
    source_hash = svc.read("raw/source.md")["sha256"]
    real_replace = os.replace
    failed = False

    def fail_once(source: str | Path, destination: str | Path) -> None:
        nonlocal failed
        destination_path = Path(destination)
        if not failed and destination_path.name == "index.md":
            failed = True
            raise OSError("injected publish failure")
        real_replace(source, destination)

    monkeypatch.setattr("second_brain_mcp.service.os.replace", fail_once)
    with pytest.raises(OSError, match="injected"):
        svc.apply_changes(
            creates=[{"path": "wiki/concepts/new-concept.md", "content": valid_page()}],
            updates=[],
            index_content="# Changed\n",
            index_expected_sha256=index_hash,
            log_title="New Concept",
            log_description="Should roll back.",
            log_operation="ingest",
            raw_source_path="raw/source.md",
            raw_expected_sha256=source_hash,
        )
    assert not (brain / "wiki" / "concepts" / "new-concept.md").exists()
    assert (brain / "wiki" / "index.md").read_text(encoding="utf-8") == original_index
    assert not (brain / "wiki" / "log.md").exists()
    assert (brain / "raw" / "source.md").is_file()
    assert not (brain / "raw" / "processed" / "source.md").exists()
