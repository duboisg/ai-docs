from __future__ import annotations

import base64
import hashlib
import os
import re
import shutil
import sqlite3
import tempfile
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import yaml


READABLE_SUFFIXES = {".md", ".markdown", ".txt"}
SEARCHABLE_AREAS = {"raw", "wiki"}
WIKI_CATEGORIES = {"sources", "entities", "concepts", "synthesis"}
SPECIAL_WIKI_FILES = {"wiki/index.md", "wiki/log.md"}
REQUIRED_FRONTMATTER = {"tags", "sources", "created", "updated"}
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
CANONICAL_WIKILINK_RE = re.compile(
    r"^wiki/(?:sources|entities|concepts|synthesis)/[a-z0-9]+(?:-[a-z0-9]+)*$"
)


class SecondBrainError(ValueError):
    """Raised when an operation violates the second-brain boundary."""


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _normalize_wikilink(value: str) -> str:
    normalized = value.strip().replace("\\", "/")
    if normalized.lower().endswith(".md"):
        normalized = normalized[:-3]
    return normalized.casefold()


@dataclass(frozen=True)
class SecondBrainConfig:
    root: Path
    writes_enabled: bool = False  # Backward-compatible test/embedding switch.
    allow_wiki_creates: bool = False
    allow_wiki_updates: bool = False
    allow_raw_imports: bool = False
    allow_raw_archives: bool = False

    @classmethod
    def from_env(cls) -> "SecondBrainConfig":
        configured_root = os.getenv("SECOND_BRAIN_ROOT")
        if not configured_root:
            raise SecondBrainError("SECOND_BRAIN_ROOT is required.")
        root = Path(configured_root).expanduser().resolve()
        legacy = _env_flag("SECOND_BRAIN_WRITES_ENABLED")
        return cls(
            root=root,
            writes_enabled=legacy,
            allow_wiki_creates=_env_flag("SECOND_BRAIN_ALLOW_WIKI_CREATES", legacy),
            allow_wiki_updates=_env_flag("SECOND_BRAIN_ALLOW_WIKI_UPDATES", legacy),
            allow_raw_imports=_env_flag("SECOND_BRAIN_ALLOW_RAW_IMPORTS", False),
            allow_raw_archives=_env_flag("SECOND_BRAIN_ALLOW_RAW_ARCHIVES", False),
        )


class SecondBrainService:
    def __init__(self, config: SecondBrainConfig):
        self.config = config
        if not config.root.is_dir():
            raise SecondBrainError(f"Second-brain root does not exist: {config.root}")

    def _resolve(self, relative_path: str, *, allowed_areas: set[str]) -> Path:
        if not relative_path or not relative_path.strip():
            raise SecondBrainError("A relative path is required.")
        candidate_input = Path(relative_path.replace("\\", "/"))
        if candidate_input.is_absolute():
            raise SecondBrainError("Absolute paths are not allowed.")
        if not candidate_input.parts or candidate_input.parts[0] not in allowed_areas:
            raise SecondBrainError(f"Path must begin with one of: {', '.join(sorted(allowed_areas))}.")
        candidate = (self.config.root / candidate_input).resolve()
        if not candidate.is_relative_to(self.config.root):
            raise SecondBrainError("Path escapes the configured second-brain root.")
        return candidate

    def _relative(self, path: Path) -> str:
        return path.relative_to(self.config.root).as_posix()

    @staticmethod
    def _ensure_text_file(path: Path) -> None:
        if path.suffix.lower() not in READABLE_SUFFIXES:
            raise SecondBrainError(f"Unsupported file type '{path.suffix}'.")

    @staticmethod
    def _parse_page(content: str) -> tuple[dict[str, Any], str, list[str]]:
        frontmatter: dict[str, Any] = {}
        body = content
        if content.startswith("---\n") or content.startswith("---\r\n"):
            match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?", content, re.DOTALL)
            if match:
                loaded = yaml.safe_load(match.group(1)) or {}
                if not isinstance(loaded, dict):
                    raise SecondBrainError("YAML frontmatter must be a mapping.")
                frontmatter = loaded
                body = content[match.end():]
        title_match = re.search(r"^#\s+(.+?)\s*$", body, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else ""
        links = sorted({link.strip() for link in WIKILINK_RE.findall(content) if link.strip()})
        return frontmatter, title, links

    def _metadata(self, path: Path, *, include_content: bool = False) -> dict[str, Any]:
        content = path.read_text(encoding="utf-8-sig")
        frontmatter, title, links = self._parse_page(content)
        relative = self._relative(path)
        parts = Path(relative).parts
        category = parts[1] if len(parts) > 2 and parts[0] == "wiki" else parts[0]
        result: dict[str, Any] = {
            "path": relative,
            "title": title,
            "category": category,
            "frontmatter": frontmatter,
            "tags": frontmatter.get("tags", []),
            "sources": frontmatter.get("sources", []),
            "updated": frontmatter.get("updated"),
            "links": links,
            "size": path.stat().st_size,
            "modified": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
            "sha256": _sha256_file(path),
        }
        if include_content:
            result["content"] = content
        return result

    def info(self) -> dict[str, Any]:
        return {
            "root": str(self.config.root),
            "permissions": {
                "wiki_creates": self.config.allow_wiki_creates or self.config.writes_enabled,
                "wiki_updates": self.config.allow_wiki_updates or self.config.writes_enabled,
                "raw_imports": self.config.allow_raw_imports,
                "raw_archives": self.config.allow_raw_archives,
            },
            "searchable_areas": sorted(SEARCHABLE_AREAS),
            "raw_is_immutable": True,
        }

    def list_files(self, path: str = "wiki", *, recursive: bool = False,
                   max_results: int = 200, cursor: int = 0,
                   categories: list[str] | None = None) -> dict[str, Any]:
        max_results = max(1, min(max_results, 1000))
        cursor = max(0, cursor)
        target = self._resolve(path, allowed_areas=SEARCHABLE_AREAS)
        if not target.exists():
            raise SecondBrainError(f"Path does not exist: {path}")
        if categories:
            unknown = set(categories) - WIKI_CATEGORIES
            if unknown:
                raise SecondBrainError(f"Unknown categories: {', '.join(sorted(unknown))}")
        iterator = [target] if target.is_file() else (target.rglob("*") if recursive else target.glob("*"))
        files = sorted(
            (item for item in iterator if item.is_file() and item.suffix.lower() in READABLE_SUFFIXES),
            key=lambda item: self._relative(item).lower(),
        )
        if categories:
            files = [p for p in files if len(Path(self._relative(p)).parts) > 2
                     and Path(self._relative(p)).parts[1] in categories]
        selected = files[cursor:cursor + max_results]
        next_cursor = cursor + len(selected) if cursor + len(selected) < len(files) else None
        return {
            "path": path,
            "pages": [self._metadata(item) for item in selected],
            "files": [self._relative(item) for item in selected],
            "count": len(selected),
            "total": len(files),
            "next_cursor": next_cursor,
            "truncated": next_cursor is not None,
        }

    def read(self, path: str, *, max_characters: int = 100_000, offset: int = 0) -> dict[str, Any]:
        max_characters = max(1, min(max_characters, 500_000))
        offset = max(0, offset)
        target = self._resolve(path, allowed_areas=SEARCHABLE_AREAS)
        self._ensure_text_file(target)
        if not target.is_file():
            raise SecondBrainError(f"File does not exist: {path}")
        content = target.read_text(encoding="utf-8-sig")
        metadata = self._metadata(target)
        chunk = content[offset:offset + max_characters]
        next_offset = offset + len(chunk) if offset + len(chunk) < len(content) else None
        return {**metadata, "content": chunk, "characters": len(content), "offset": offset,
                "next_offset": next_offset, "truncated": next_offset is not None}

    def _search_documents(self, area: str, categories: list[str] | None) -> list[Path]:
        root = self._resolve(area, allowed_areas=SEARCHABLE_AREAS)
        if not root.exists():
            return []
        docs = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in READABLE_SUFFIXES]
        if categories and area == "wiki":
            docs = [p for p in docs if len(Path(self._relative(p)).parts) > 2
                    and Path(self._relative(p)).parts[1] in categories]
        return sorted(docs, key=lambda p: self._relative(p).lower())

    def search(self, query: str, *, area: str = "wiki", max_results: int = 20,
               cursor: int = 0, categories: list[str] | None = None,
               tags: list[str] | None = None) -> dict[str, Any]:
        if not query.strip():
            raise SecondBrainError("Search query cannot be empty.")
        if area not in SEARCHABLE_AREAS:
            raise SecondBrainError(f"Unknown area '{area}'.")
        if categories and set(categories) - WIKI_CATEGORIES:
            raise SecondBrainError("One or more categories are invalid.")
        docs = self._search_documents(area, categories)
        db = sqlite3.connect(":memory:")
        db.execute("CREATE VIRTUAL TABLE pages USING fts5(path, title, tags, sources, body)")
        metadata: dict[str, dict[str, Any]] = {}
        for path in docs:
            try:
                item = self._metadata(path, include_content=True)
            except (OSError, UnicodeError, yaml.YAMLError, SecondBrainError):
                continue
            item_tags = [str(tag) for tag in item["tags"]] if isinstance(item["tags"], list) else []
            if tags and not set(tags).issubset(set(item_tags)):
                continue
            metadata[item["path"]] = item
            db.execute("INSERT INTO pages VALUES (?, ?, ?, ?, ?)", (
                item["path"], item["title"], " ".join(item_tags),
                " ".join(map(str, item["sources"])) if isinstance(item["sources"], list) else "",
                item["content"],
            ))
        tokens = re.findall(r"[\w-]+", query, re.UNICODE)
        fts_query = " OR ".join(f'"{token.replace(chr(34), chr(34) * 2)}"' for token in tokens)
        rows = [] if not fts_query else db.execute(
            "SELECT path, title, snippet(pages, 4, '', '', ' … ', 20), bm25(pages, 2.0, 4.0, 2.0, 1.5, 1.0) "
            "FROM pages WHERE pages MATCH ? ORDER BY bm25(pages, 2.0, 4.0, 2.0, 1.5, 1.0)",
            (fts_query,),
        ).fetchall()
        max_results = max(1, min(max_results, 100))
        cursor = max(0, cursor)
        chosen = rows[cursor:cursor + max_results]
        results = []
        for page_path, title, snippet, rank in chosen:
            item = metadata[page_path]
            results.append({"path": page_path, "title": title, "excerpt": snippet,
                            "score": -float(rank), "tags": item["tags"],
                            "updated": item["updated"], "sha256": item["sha256"]})
        next_cursor = cursor + len(chosen) if cursor + len(chosen) < len(rows) else None
        return {"query": query, "area": area, "results": results, "count": len(results),
                "total": len(rows), "next_cursor": next_cursor, "truncated": next_cursor is not None,
                "search_mode": "fts5-bm25"}

    def validate_page(self, path: str, content: str | None = None) -> dict[str, Any]:
        target = self._resolve(path, allowed_areas={"wiki"})
        relative = self._relative(target)
        errors: list[str] = []
        warnings: list[str] = []
        if target.suffix.lower() != ".md":
            errors.append("Wiki pages must use the .md suffix.")
        if relative not in SPECIAL_WIKI_FILES:
            parts = Path(relative).parts
            if len(parts) != 3 or parts[1] not in WIKI_CATEGORIES:
                errors.append("Wiki pages must be in sources, entities, concepts, or synthesis.")
            if not KEBAB_RE.fullmatch(target.name):
                errors.append("Wiki page filenames must be kebab-case.")
        if content is None:
            if not target.is_file():
                errors.append("Page does not exist and no content was supplied.")
                content = ""
            else:
                content = target.read_text(encoding="utf-8-sig")
        try:
            frontmatter, title, links = self._parse_page(content)
        except (yaml.YAMLError, SecondBrainError) as exc:
            errors.append(f"Invalid YAML frontmatter: {exc}")
            frontmatter, title, links = {}, "", []
        for link in links:
            if not CANONICAL_WIKILINK_RE.fullmatch(link):
                errors.append(
                    f"Wikilink target must use a canonical wiki path with a display label: {link}"
                )
        if relative not in SPECIAL_WIKI_FILES:
            missing = sorted(REQUIRED_FRONTMATTER - set(frontmatter))
            if missing:
                errors.append(f"Missing frontmatter fields: {', '.join(missing)}")
            for field in ("tags", "sources"):
                if field in frontmatter and not isinstance(frontmatter[field], list):
                    errors.append(f"Frontmatter '{field}' must be a list.")
            aliases = frontmatter.get("aliases", [])
            if not isinstance(aliases, list):
                errors.append("Frontmatter 'aliases' must be a list.")
                aliases = []
            for field in ("created", "updated"):
                value = frontmatter.get(field)
                if value is not None:
                    try:
                        parsed = value if isinstance(value, date) else date.fromisoformat(str(value))
                        frontmatter[field] = parsed.isoformat()
                    except ValueError:
                        errors.append(f"Frontmatter '{field}' must be YYYY-MM-DD.")
            if frontmatter.get("created") and frontmatter.get("updated") \
                    and frontmatter["updated"] < frontmatter["created"]:
                errors.append("updated cannot be earlier than created.")
            if not title:
                errors.append("Page must contain one H1 title.")
            elif _normalize_wikilink(target.stem) != _normalize_wikilink(title) \
                    and title not in aliases:
                errors.append(
                    "H1 title must appear in frontmatter 'aliases' when it differs from the filename."
                )
            for source in frontmatter.get("sources", []) if isinstance(frontmatter.get("sources"), list) else []:
                source_name = Path(str(source)).name
                if not any((self.config.root / "raw").rglob(source_name)):
                    warnings.append(f"Raw source not found: {source}")
        return {"path": relative, "valid": not errors, "errors": errors, "warnings": warnings,
                "title": title, "frontmatter": frontmatter, "links": links,
                "sha256": _sha256_bytes(content.encode("utf-8"))}

    def snapshot(self, *, cursor: int = 0, max_results: int = 200,
                 categories: list[str] | None = None,
                 include_pages: bool = True) -> dict[str, Any]:
        listing = self.list_files("wiki", recursive=True, cursor=cursor,
                                  max_results=max_results, categories=categories)
        all_pages = self.list_files("wiki", recursive=True, max_results=1000)["pages"]
        title_groups: dict[str, list[str]] = {}
        identifiers: dict[str, set[str]] = {}
        for page in all_pages:
            if page["title"]:
                title_groups.setdefault(page["title"], []).append(page["path"])
            page_path = Path(page["path"])
            candidates = {
                page_path.stem,
                page_path.with_suffix("").as_posix(),
                *page["frontmatter"].get("aliases", []),
            }
            for candidate in candidates:
                if isinstance(candidate, str) and candidate.strip():
                    identifiers.setdefault(_normalize_wikilink(candidate), set()).add(page["path"])
        inbound = {page["path"]: 0 for page in all_pages}
        for page in all_pages:
            for link in page["links"]:
                targets = identifiers.get(_normalize_wikilink(link), set())
                if len(targets) == 1:
                    inbound[next(iter(targets))] += 1
        index_text = (self.config.root / "wiki" / "index.md").read_text(encoding="utf-8-sig") \
            if (self.config.root / "wiki" / "index.md").is_file() else ""
        findings: list[dict[str, str]] = []
        for title, paths in title_groups.items():
            if len(paths) > 1:
                findings.append({"severity": "error", "check": "duplicate-title",
                                 "path": ", ".join(paths), "message": f"Duplicate page title: {title}"})
        for identifier, paths in sorted(identifiers.items()):
            if len(paths) > 1:
                findings.append({"severity": "error", "check": "ambiguous-link-target",
                                 "path": ", ".join(sorted(paths)),
                                 "message": f"Wikilink identifier is ambiguous: {identifier}"})
        indexed_paths: set[str] = set()
        for index_link in sorted(set(WIKILINK_RE.findall(index_text))):
            targets = identifiers.get(_normalize_wikilink(index_link), set())
            if not targets:
                findings.append({"severity": "error", "check": "index-target", "path": "wiki/index.md",
                                 "message": f"Index target does not exist: {index_link}"})
            elif len(targets) > 1:
                findings.append({"severity": "error", "check": "index-target", "path": "wiki/index.md",
                                 "message": f"Index target is ambiguous: {index_link}"})
            else:
                indexed_paths.update(targets)
        for page in all_pages:
            if page["path"] in SPECIAL_WIKI_FILES:
                continue
            validation = self.validate_page(page["path"])
            for error in validation["errors"]:
                findings.append({"severity": "error", "check": "schema", "path": page["path"], "message": error})
            for warning in validation["warnings"]:
                findings.append({"severity": "warning", "check": "source", "path": page["path"], "message": warning})
            if page["title"] and page["path"] not in indexed_paths:
                findings.append({"severity": "warning", "check": "index", "path": page["path"], "message": "Page is absent from wiki/index.md."})
            if page["title"] and inbound.get(page["path"], 0) == 0:
                findings.append({"severity": "warning", "check": "orphan", "path": page["path"], "message": "Page has no inbound wikilinks."})
            for link in page["links"]:
                targets = identifiers.get(_normalize_wikilink(link), set())
                if not targets:
                    findings.append({"severity": "warning", "check": "broken-link", "path": page["path"], "message": f"Missing target: {link}"})
                elif len(targets) > 1:
                    findings.append({"severity": "error", "check": "ambiguous-link", "path": page["path"], "message": f"Ambiguous target: {link}"})
        listing["findings"] = findings
        listing["revision"] = _sha256_bytes("\n".join(f"{p['path']}:{p['sha256']}" for p in all_pages).encode())
        if not include_pages:
            return {
                "path": "wiki",
                "total": len(all_pages),
                "revision": listing["revision"],
                "findings": findings,
            }
        return listing

    def _check_write_permission(self, relative: str, existed: bool) -> None:
        if relative.startswith("wiki/"):
            allowed = (self.config.allow_wiki_updates if existed else self.config.allow_wiki_creates) \
                or self.config.writes_enabled
        else:
            allowed = False
        if not allowed:
            action = "updates" if existed else "creates"
            raise SecondBrainError(f"{relative.split('/')[0].title()} {action} are disabled by the host.")

    def write_page(self, path: str, content: str, *, expected_sha256: str | None = None) -> dict[str, Any]:
        target = self._resolve(path, allowed_areas={"wiki"})
        relative = self._relative(target)
        existed = target.exists()
        self._check_write_permission(relative, existed)
        if target.suffix.lower() != ".md":
            raise SecondBrainError("Writes are restricted to .md files.")
        if relative.startswith("wiki/"):
            validation = self.validate_page(relative, content)
            if not validation["valid"]:
                raise SecondBrainError("Invalid wiki page: " + "; ".join(validation["errors"]))
        before_hash = _sha256_file(target) if existed else None
        if existed and expected_sha256 is None:
            raise SecondBrainError("expected_sha256 is required when updating an existing file.")
        if existed and expected_sha256 != before_hash:
            raise SecondBrainError("File changed since it was read; expected_sha256 does not match.")
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=target.parent, delete=False) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        try:
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        after_hash = _sha256_file(target)
        return {"path": relative, "operation": "updated" if existed else "created", "sha256": after_hash}

    def append_log(self, title: str, description: str, *, operation: str = "note") -> dict[str, Any]:
        log_path = self._resolve("wiki/log.md", allowed_areas={"wiki"})
        self._check_write_permission("wiki/log.md", log_path.exists())
        clean_title = " ".join(title.splitlines()).strip()
        clean_operation = re.sub(r"[^a-z0-9-]+", "-", operation.lower()).strip("-")
        if not clean_title or not clean_operation:
            raise SecondBrainError("Title and operation are required.")
        log_path.parent.mkdir(parents=True, exist_ok=True)
        prefix = "" if not log_path.exists() or log_path.stat().st_size == 0 else "\n"
        entry = f"{prefix}## [{date.today().isoformat()}] {clean_operation} | {clean_title}\n{description.strip()}\n"
        with log_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(entry)
        return {"path": "wiki/log.md", "operation": "appended", "title": clean_title}

    def import_raw(self, filename: str, *, content_base64: str) -> dict[str, Any]:
        if not self.config.allow_raw_imports:
            raise SecondBrainError("Raw imports are disabled by the host.")
        if Path(filename).name != filename or not filename.strip():
            raise SecondBrainError("filename must be a plain filename without directories.")
        target = self._resolve(f"raw/{filename}", allowed_areas={"raw"})
        if target.exists():
            raise SecondBrainError("Raw files are immutable; the destination already exists.")
        try:
            content = base64.b64decode(content_base64, validate=True)
        except ValueError as exc:
            raise SecondBrainError("content_base64 is invalid.") from exc
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("wb", dir=target.parent, delete=False) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        try:
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
        digest = _sha256_file(target)
        return {"path": self._relative(target), "sha256": digest, "bytes": len(content)}

    def apply_changes(self, *, creates: list[dict[str, str]], updates: list[dict[str, str]],
                      index_content: str, index_expected_sha256: str,
                      log_title: str, log_description: str, log_operation: str,
                      raw_source_path: str | None = None,
                      raw_expected_sha256: str | None = None) -> dict[str, Any]:
        transaction_id = str(uuid.uuid4())
        clean_title = " ".join(log_title.splitlines()).strip()
        clean_operation = re.sub(r"[^a-z0-9-]+", "-", log_operation.lower()).strip("-")
        if not clean_title or not clean_operation:
            raise SecondBrainError("Log title and operation are required.")
        if (raw_source_path is None) != (raw_expected_sha256 is None):
            raise SecondBrainError("raw_source_path and raw_expected_sha256 must be supplied together.")
        raw_source: Path | None = None
        raw_archive: Path | None = None
        if raw_source_path is not None:
            if not self.config.allow_raw_archives:
                raise SecondBrainError("Raw archives are disabled by the host.")
            raw_source = self._resolve(raw_source_path, allowed_areas={"raw"})
            raw_relative = Path(self._relative(raw_source))
            if len(raw_relative.parts) != 2 or raw_relative.parts[0] != "raw":
                raise SecondBrainError("Only pending files directly under raw/ can be archived.")
            if not raw_source.is_file():
                raise SecondBrainError(f"Raw source does not exist: {raw_source_path}")
            if _sha256_file(raw_source) != raw_expected_sha256:
                raise SecondBrainError(f"Revision conflict: {raw_source_path}")
            raw_archive = self._resolve(
                f"raw/processed/{raw_source.name}", allowed_areas={"raw"})
            if raw_archive.exists():
                raise SecondBrainError(f"Processed raw destination already exists: {self._relative(raw_archive)}")
        changes: list[tuple[Path, str, str | None]] = []
        log = self._resolve("wiki/log.md", allowed_areas={"wiki"})
        log_update: dict[str, str] | None = None
        for item in creates:
            changes.append((self._resolve(item["path"], allowed_areas={"wiki"}), item["content"], None))
        for item in updates:
            target = self._resolve(item["path"], allowed_areas={"wiki"})
            if target == log:
                if log_update is not None:
                    raise SecondBrainError("Duplicate transaction path: wiki/log.md")
                log_update = item
            else:
                changes.append((target, item["content"], item["expected_sha256"]))
        index = self._resolve("wiki/index.md", allowed_areas={"wiki"})
        changes.append((index, index_content, index_expected_sha256))
        existing_log = log_update["content"] if log_update is not None else (
            log.read_text(encoding="utf-8-sig") if log.exists() else ""
        )
        log_expected = log_update["expected_sha256"] if log_update is not None else (
            _sha256_file(log) if log.exists() else None
        )
        separator = "" if not existing_log or existing_log.endswith("\n\n") else "\n"
        log_entry = (
            f"{separator}## [{date.today().isoformat()}] {clean_operation} | {clean_title}\n"
            f"{log_description.strip()}\n"
        )
        changes.append((log, existing_log + log_entry, log_expected))
        seen: set[Path] = set()
        for target, content, expected in changes:
            if target in seen:
                raise SecondBrainError(f"Duplicate transaction path: {self._relative(target)}")
            seen.add(target)
            existed = target.exists()
            self._check_write_permission(self._relative(target), existed)
            current = _sha256_file(target) if existed else None
            if existed and expected != current:
                raise SecondBrainError(f"Revision conflict: {self._relative(target)}")
            if not existed and expected is not None:
                raise SecondBrainError(f"Create unexpectedly supplied a revision: {self._relative(target)}")
            validation = self.validate_page(self._relative(target), content)
            if not validation["valid"]:
                raise SecondBrainError(f"Invalid page {self._relative(target)}: {'; '.join(validation['errors'])}")
        work = Path(tempfile.mkdtemp(prefix="second-brain-txn-"))
        backups = work / "backups"
        staged = work / "staged"
        replaced: list[Path] = []
        raw_moved = False
        try:
            for target, content, _ in changes:
                rel = target.relative_to(self.config.root)
                stage = staged / rel
                stage.parent.mkdir(parents=True, exist_ok=True)
                stage.write_text(content, encoding="utf-8", newline="\n")
                if target.exists():
                    backup = backups / rel
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(target, backup)
            for target, _, _ in changes:
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(staged / target.relative_to(self.config.root), target)
                replaced.append(target)
            if raw_source is not None and raw_archive is not None:
                raw_archive.parent.mkdir(parents=True, exist_ok=True)
                os.replace(raw_source, raw_archive)
                raw_moved = True
        except Exception:
            if raw_moved and raw_source is not None and raw_archive is not None:
                os.replace(raw_archive, raw_source)
            for target in reversed(replaced):
                backup = backups / target.relative_to(self.config.root)
                if backup.exists():
                    os.replace(backup, target)
                else:
                    target.unlink(missing_ok=True)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
        committed = []
        for target, _, _ in changes:
            metadata = self._metadata(target)
            committed.append({
                "path": metadata["path"],
                "title": metadata["title"],
                "sha256": metadata["sha256"],
                "size": metadata["size"],
            })
        archived = None
        if raw_moved and raw_archive is not None:
            metadata = self._metadata(raw_archive)
            archived = {
                "path": metadata["path"],
                "title": metadata["title"],
                "sha256": metadata["sha256"],
                "size": metadata["size"],
            }
        return {
            "transaction_id": transaction_id,
            "changes": committed,
            "log": "wiki/log.md",
            "raw_archive": archived,
        }
