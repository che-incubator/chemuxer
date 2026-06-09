# Chemuxer — Project Rules

## Test-Driven Development

**MANDATORY**: Follow TDD for all code changes — features, bug fixes, and refactors.

1. Write the failing test first
2. Run it to confirm it fails
3. Write the minimal implementation to make it pass
4. Run tests to confirm they pass
5. Refactor if needed, keeping tests green

Skip TDD only for pure configuration changes (e.g., .gitignore, package.json metadata) where no testable behavior exists.

## Branching Strategy

**MANDATORY**: Every contribution must be on a dedicated branch. Never commit directly to `main`.

- Features: `feature/<name>`
- Bug fixes: `bugfix/<name>`
- Merge to `main` when work is complete and all tests pass
- Delete the branch after merging
