# Outputs Workspace Instructions

`outputs/` contains registered longitudinal projects and a `_one-offs/` landing zone. Read `outputs/README.md` first.

## Routing New Work

1. If the work clearly advances a registered project, place it in that project.
2. If the project match is uncertain, create or reuse `outputs/_one-offs/<short-task-slug>/`.
3. Do not force a task into the nearest thematic project merely to keep the root tidy.
4. Do not scan unrelated folders unless the task requires cross-project analysis or repository archaeology.

## Registered Projects

Every registered project contains:

- `README.md` for the current purpose, scope, state, decisions, next steps, important artifacts, hazards, and knowledge links.
- `LOG.md` for meaningful chronological events.
- Named workstream folders for investigations, applications, experiments, deliverables, or recurring areas of work.

Update the project `README.md` when its current truth changes. Append a dated `LOG.md` entry for decisions, milestones, results, important blockers, changes of direction, or significant new artifacts. Do not log routine commands, incidental edits, or regenerated intermediates.

## One-offs

`_one-offs/` is the default when routing is ambiguous; it is not a trash folder. Each task should have a focused kebab-case directory. Add a short `README.md` when context or safe resumption matters. A `LOG.md` is optional until the work becomes longitudinal.

Treat every project and one-off as private working material unless the workspace owner explicitly approves publication or knowledge promotion.

## Promotion Signals

One-offs sharing a theme become a project candidate when:

- multiple tasks pursue a common outcome;
- their decisions or artifacts become interdependent;
- the theme develops an ongoing state and next actions;
- new tasks keep recurring;
- understanding the work requires a longitudinal log.

At a natural checkpoint, propose the promotion to the workspace owner. Do not silently promote it. Once approved, create a first-level project folder, consolidate the relevant one-offs, add project `README.md` and `LOG.md`, and update `outputs/README.md`.

## Workstream Artifacts

When useful inside a project or one-off, use:

- `runs/<timestamp>/` for dry-runs, applied runs, backups, and verification outputs.
- `review.*` for user-editable review surfaces.
- `plan.json` or `manifest.json` when a script will mutate external systems.
- `backup/` before any mutation.
- `verification.json` after any mutation.
