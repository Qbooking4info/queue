# Working agreement for Claude Code in this repo

## Auto-commit & auto-push (standing authorization)

The repo owner has explicitly authorized Claude to commit and push to
**the current non-default branch** periodically during active work,
**without asking for confirmation each time**. This overrides the general
"only commit when explicitly asked" default for this repo specifically.

**Cadence:** roughly every 30–60 minutes of active work, at the nearest safe
checkpoint (code compiles / typechecks, nothing left mid-edit) — not gated on
a full feature being finished. There is no background timer making this
happen on its own; it's Claude self-pacing during a live session by tracking
elapsed work time and pausing to commit+push at a sensible point.

**What's authorized automatically:**
- `git add` on the specific files just worked on (never a blind `-A`/`.`
  without reviewing what's staged)
- `git commit`, with a real descriptive message per the repo's normal
  standards, ending with the `Co-Authored-By` trailer already in use
- `git push` to the current branch's existing upstream (or `-u` on first push
  of a new branch)

**What still requires asking first, every time — no exceptions:**
- Anything on `main`/the default branch: create/switch to a feature branch
  first, same as always
- `--force`/`--force-with-lease` push, `git reset --hard`, amending a commit
  already pushed, or any other history rewrite
- Opening, merging, or closing a pull request
- Deleting a branch, tag, or remote

**Still applies regardless of auto-commit authorization:** review what's
actually staged before committing (`git status`/`git diff --stat`) and check
file contents before adding anything that looks like it could hold a secret,
even with an innocuous filename — this authorization covers routine
commit/push mechanics, not skipping the judgment call on what goes into a
commit.
