# Collaboration protocol

Three contributors share this repo: an **implementation agent**, **Claude**, and
**Instinct**. Edward is the owner and the only person who merges to `main`.

## Roles

| Role | Owner | Does | Does not |
| --- | --- | --- | --- |
| Implementation & integration | Implementation agent | Writes features, wires them into the CLI, CI and deploy | Merge its own PRs |
| Architecture & independent review | Claude | Writes design notes before large changes, reviews every PR, owns shared seams (see below) | Rewrite another author's PR; it comments and suggests |
| Product behaviour & acceptance | Instinct | Writes acceptance criteria, runs the feature like a user, gives a pass/fail verdict | Change code to make a check pass |
| Merge | Edward | Merges once review and acceptance both pass | — |

The idea is the four-eyes principle you'd find in a bank's payments desk:
whoever books a transaction can't also approve it.

## Workflow, step by step

1. **Task**: open a GitHub issue. Instinct adds acceptance criteria as a
   checklist. For anything over ~300 lines, or anything that touches a shared
   seam, Claude adds a short design note in the issue first.
2. **Build**: exactly one author per task, on that author's own branch
   (`claude/*`, `instinct/*`, and the implementation agent's own prefix).
   Nobody pushes to someone else's branch.
3. **PR**: open it as a draft that links the issue and says what is
   *out of scope*.
4. **Review**: Claude reviews correctness and design. Instinct checks the PR
   against the acceptance checklist.
5. **Merge**: Edward merges once CI is green, Claude approves and Instinct
   passes it.

## Ownership by area

| Path | Primary owner | Notes |
| --- | --- | --- |
| `src/aikido/transpiler*`, `src/aikido/commands/` | Implementation agent | Claude reviews |
| `src/aikido/village/` | Implementation agent | |
| `caloria-bebe/`, `android/`, `azure/` | Implementation agent | Instinct accepts on device |
| `tests/` | Whoever wrote the code | Instinct may add acceptance tests |
| `COLLABORATION.md`, `docs/concepts.html`, `docs/structure.html` | Claude | |

### Shared seams (where conflicts happen)

These files get touched by almost every feature. The rules for them:

- **`src/aikido/cli.py`**: keep each command group in its own module and
  register it with a single line. Don't put logic in `cli.py`.
- **`docs/commands.html` and `docs/commands.meta.json`**: these are
  *generated*. Never hand-merge them. After a rebase, run
  `python scripts/gen_docs.py` and commit the result.
- **`README.md`**: each feature gets its own section. Don't reorder sections
  you didn't write.
- **`pyproject.toml` and `.github/workflows/`**: these need Claude's review
  even for a one-line change.

## Order for the PRs open today

1. **#13 Android APK** is small and touches `commands/daily.py`, so merge it
   first.
2. **#15 Agent Village** is large and touches `cli.py`, the README and the
   generated docs. Rebase it after #13, regenerate the docs, then review.

## Communication

- Decisions go in the issue or PR, not in chat. If it isn't in GitHub, it
  wasn't decided.
- If you're blocked, label the issue `blocked` and name the person you're
  waiting on.
- Disagreements: the role owner decides within their column above, and Edward
  breaks ties.
