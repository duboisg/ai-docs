# Contributing

Thanks for helping improve AI Docs.

## Before you start

- Read the root `README.md` and `AGENTS.md`.
- Search existing issues and discussions before opening a new one.
- Never include credentials, personal data, browser profiles, private project artifacts, or second-brain content.
- Keep changes focused on reusable starter-kit infrastructure.

Use an issue for reproducible bugs and a discussion for setup questions or early design ideas. For security concerns, follow `SECURITY.md` instead of opening a public issue.

## Development

Install only the component you are changing. Each MCP server documents its own setup and dependencies.

Run the relevant checks before submitting a pull request:

```powershell
# Browser Agent
Set-Location mcp-servers\browser-agent
npm test
npm run check

# Second Brain
Set-Location ..\second-brain
python -m pytest
```

For PowerShell scripts, verify that they parse cleanly and exercise destructive or external-write behavior only in a safe test environment.

## Pull requests

A useful pull request:

- explains the problem and the intended outcome;
- describes any trust-boundary or permission changes;
- includes tests or verification evidence appropriate to the change;
- updates documentation when setup or behavior changes;
- contains no generated runtime state or private data.

By contributing, you agree that your contribution will be licensed under the repository's MIT License.
