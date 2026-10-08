# Agent guide

Read the applicable guides in [docs/code-standards/](docs/code-standards/) before making changes:

- [Code](docs/code-standards/code.md)
- [Git](docs/code-standards/git.md)
- [Packaging](docs/code-standards/packaging.md)
- [Testing](docs/code-standards/testing.md)
- [TSDoc](docs/code-standards/tsdoc.md)

## Project context

- `pi-usage` is a footer status extension for pi, currently supporting Codex.
- `extensions/usage-status.ts` owns extension registration and lifecycle behavior.
- `src/usage/` owns usage retrieval, formatting, commands, and preferences.
- `README.md` documents installation and user-facing commands and settings; `assets/` contains the footer preview.
- The package is installed from GitHub, not npm. Keep installation instructions accurate.
- Preserve provider-specific identifiers such as `openai-codex`; the project rename does not change the provider's API or authentication contract.

## Working rules

- Keep changes in the owning module and follow the applicable standards. Do not refactor unrelated code merely to adopt these guides.
- Use precise names for meaningful intermediate values; leave obvious one-use expressions inline.
- Test observable behavior with meaningful tests. Unit tests belong beside source, shared fixtures in `testing/`, and integration tests in `src/testing/integration/`.
- For behavior changes, establish the contract, confirm a meaningful failing test, implement the change, and verify the result without weakening tests. Seek independent QA when available.
- Isolate settings and authentication tests with a temporary `PI_CODING_AGENT_DIR`. Never read, modify, or publish real account credentials for tests; mock external usage requests.
- Report verification commands and results.
- Use Conventional Commits. Include relevant context, scope, considerations, decisions, and verification in the commit body. Mark breaking changes to commands or settings explicitly.
- Do not commit or push unless explicitly requested.
