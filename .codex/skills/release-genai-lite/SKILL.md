---
name: release-genai-lite
description: Determine and execute a patch or minor genai-lite release through its pull request, CI, annotated tag, and GitHub release workflow. INVOKE ONLY when the user explicitly invokes $release-genai-lite or /release-genai-lite, names this skill, or directly asks to execute the repository release process. Do not invoke for general questions about versions, tags, pull requests, npm, or release planning.
---

# Release genai-lite

Release a completed, tested change through GitHub. Decide between a patch and
minor version unless the user explicitly specifies the version. Leave npm
publication to the user unless they separately and explicitly authorize it.

## Fixed repository conventions

- Use `main` as the base branch and `origin` as the remote.
- Keep release work on the existing feature branch. If starting from `main`,
  create `release/vX.Y.Z` before changing version metadata.
- Never commit a release bump directly to `main`.
- Store the package version in `package.json` and in the root package entries
  at the top of `package-lock.json`.
- Use Conventional Commits and DCO sign-off. Commit a separate version bump as
  `chore: bump version to X.Y.Z` with `git commit -s`.
- Merge pull requests with a merge commit, not squash or rebase.
- Use annotated tags named `vX.Y.Z`.
- Name releases `vX.Y.Z — concise release theme`.
- Structure release notes with `Highlights`, `Verification`, and
  `Full implementation: #PR`.
- Require every GitHub check to pass before merging.
- Treat npm publication as a manual handoff by default.

## Safety and resumption

- Honor a narrower user request. If the user asks only for version judgment,
  stop after reporting the decision.
- Inspect live Git and GitHub state before every mutation. Stable conventions
  are encoded here; branch, PR, tag, release, and CI state are not.
- Preserve unrelated work. Stop and ask if the worktree contains changes that
  are not clearly part of the release.
- Require the implementation to be release-ready and committed before adding
  the version bump. Do not absorb unfinished feature work into this workflow.
- Resume verified completed steps instead of repeating them.
- Never force-push, move an existing tag, overwrite a release, or merge around
  failed or pending checks.
- Delete only the exact merged release branch, and only after verifying it is
  contained in `main`.
- Never run paid real-provider E2E tests without explicit user authorization.
- Do not infer a major release. If the changes appear breaking and the user did
  not explicitly request a major version, stop and ask.

## 1. Establish release state

Read the repository instructions and root summary files. Inspect the worktree,
remote, latest version tag, commits since that tag, current package version,
current branch, and any open PR from that branch.

Compare the latest tag with `package.json`. Investigate mismatches before
proceeding, and do not bump again when the intended target is already present.
If the clean worktree is on `main`, create `release/vX.Y.Z` after selecting the
target. Reuse a suitable existing non-`main` branch when it already contains
the release changes.

## 2. Select patch or minor

Judge the highest-impact change since the latest release:

- Choose **patch** for bug fixes, regressions, provider compatibility updates,
  documentation corrections, dependency or security maintenance, and internal
  changes that add no public capability.
- Choose **minor** for a new public API, exported type, provider, model,
  setting, callback, response field, or other backward-compatible user-facing
  capability.
- Choose **minor** when a correctness fix necessarily introduces public API.
  Version 0.16.0 is the precedent: its correctness fix added a public callback,
  types, and inspectable binding.
- Choose minor when a release contains both patch and minor changes.

Increment from the latest released version. State the target and a one-sentence
rationale before editing. Follow an explicitly requested patch or minor target
unless it conflicts with existing repository state. Never infer a major bump;
stop and ask if the changes appear to require one.

## 3. Update version metadata

Edit only:

- `package.json`: top-level `version`
- `package-lock.json`: top-level `version`
- `package-lock.json`: `packages[""].version`

Confirm all three fields contain the target, the old version is absent from
those locations, and the diff contains no unrelated edits.

## 4. Run release gates

Run every blocking local check:

```text
npm test
npm audit --omit=dev --audit-level=high
npm run build
npm run test:packed-api
npm pack --dry-run
git diff --check
```

Require all checks to pass. Record actual suite/test counts, audit results, and
the dry-run package version for PR and release notes. The production-only audit
is the blocking security gate; a full-tree audit is informational.

Do not run paid real-provider E2E tests solely because this is a release. Run
them only when separately justified and explicitly authorized.

## 5. Commit and push

Commit only the two version files:

```text
git add package.json package-lock.json
git commit -s -m "chore: bump version to X.Y.Z"
git push
```

Verify the `Signed-off-by` trailer and upstream synchronization.

## 6. Create or reuse the pull request

Check for an open PR from the branch before creating one. Reuse it when present.
Otherwise create a PR targeting `main` with:

- A title describing the release's main feature or fix, or
  `chore: release vX.Y.Z` for a version-only branch
- A concise summary and version bump
- Actual local verification results

Capture its number and URL.

## 7. Wait for green CI and merge

Monitor `gh pr checks`. Expect package validation, production security audit,
and the supported Node/OS matrix, but report the checks that actually run
instead of hard-coding a count.

Keep the user updated while jobs are pending. Investigate and fix any failure,
rerun relevant local checks, commit with DCO, push, and wait for replacement
CI. Do not merge until every required check is green.

Merge with `gh pr merge <PR> --merge`. Verify the PR state is `MERGED` and
record the merge commit.

## 8. Synchronize main and remove the branch

Run:

```text
git switch main
git pull --ff-only
```

Verify `main` contains the merge, reports the target package version, matches
`origin/main`, has a clean worktree, and contains the release branch as an
ancestor. Delete the exact merged branch locally with `git branch -d`, then
delete it from `origin` if it still exists. Never delete `main`.

## 9. Create and push the annotated tag

Check local and remote tag state. Stop if `vX.Y.Z` exists unless it already
points to the verified release commit and the workflow is resuming.

Create and verify:

```text
git tag -a vX.Y.Z -m "vX.Y.Z — concise release theme"
git push origin vX.Y.Z
```

Verify the peeled tag commit equals the intended `main` release commit before
pushing. Push only the exact tag. Never force or move a published version tag.

## 10. Publish the GitHub release

Create a non-draft, non-prerelease release with `gh release create`,
`--verify-tag`, and the same title as the annotated tag. Use curated notes:

```markdown
## Highlights

- Describe user-visible changes and important correctness guarantees.

## Verification

- Summarize the actual green CI matrix.
- Summarize local tests, audit, build, packed API, and package validation.

Full implementation: #PR
```

Verify the release tag, title, publication time, URL, and draft/prerelease
flags. If the tag was published but release creation failed, preserve the tag
and retry only release creation.

## 11. Hand off npm publication

Do not run `npm publish` by default. Tell the user the GitHub release is
complete and npm publication remains. After the user confirms publication,
optionally verify it with `npm view genai-lite@X.Y.Z version`.

Only publish to npm when the user separately and explicitly authorizes that
external action and npm authentication is available.

## 12. Report completion

Report the version and classification, PR and release URLs, merge commit,
annotated tag, branch cleanup, clean synchronized `main`, local and CI
verification, and npm publication status or handoff.
