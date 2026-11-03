---
description: Integrate the open Dependabot PRs into one signed integrator branch, verify it, run the Release rehearsal, and fast-forward main
---

# Task: integrate the open Dependabot PRs and land them on main

Integrate every open pull request opened by Dependabot on this repository's GitHub remote (`origin`) into one integrator branch, verify it, and land it on main — end to end. Only Dependabot's PRs are integrated; every other open PR is left alone. Work from this repository's local clone. Tell me briefly what you are doing at each step. If any check or gate below fails, stop at that point, leave main untouched, and report what failed and why.

## Hard rules
- Every commit you create must be signed with my configured signing key. Use `git merge -S` / `git commit -S`. Never create a commit in a way that skips signing (e.g. `git commit-tree` without `-S`). If signing fails, stop — never fall back to unsigned commits.
- Never mention Claude, AI, or any assistant anywhere: no `Co-Authored-By` trailers, no "Generated with …" lines — not in commit messages, PR titles, PR descriptions or comments.
- Never rewrite, rebase or re-sign the Dependabot commits; they must reach main unchanged.
- Never merge, close, comment on or otherwise touch a PR that isn't Dependabot's.
- Never force-push main. Never use GitHub's merge/rebase/squash buttons. Never change repository settings, rulesets or Dependabot alerts.
- Do not touch my current checkout, its branch or its uncommitted changes. Do all work in a separate temporary git worktree.
- Add nothing beyond the PRs' own changes, except a fix needed to make checks pass — and only after I approve it (step 5).

## Tools
This needs `git`, the GitHub CLI (`gh`, used for everything on GitHub) and `node`/`npm`. Don't assume an OS, shell or install location: find the tools on PATH, and if one is missing, or `gh` isn't signed in with push access to the repository, stop and tell me. Keep commands shell-neutral — prefer `gh … --json <fields>` and read the JSON yourself over shell-specific quoting and pipelines — and judge success by exit codes, not by formatted output. Waits on GitHub (`gh pr checks --watch`, `gh run watch`) can take well over ten minutes; run them so a command timeout doesn't cut them off.

## Steps

1. **Preflight.**
   - `git fetch origin --prune`; `gh auth status`. Record the repository as REPO (`owner/name`) and its host as HOST (e.g. `github.com`), from `gh repo view --json nameWithOwner,url`. Record the SHA of origin/main as BASE.
   - A signing key must be configured (`git config --get user.signingkey`). If it isn't, stop and ask me.
   - List the open PRs: `gh pr list --state open --limit 200 --json number,author,headRefName,headRefOid,baseRefName,isDraft,isCrossRepository,title`. A PR is Dependabot's when its `author.login` is `app/dependabot` (how `gh pr list` names the `dependabot[bot]` account), `author.is_bot` is true, and its head branch starts with `dependabot/`. Only those are integrated. Note every other open PR as skipped for the report and leave it alone.
   - If there are no Dependabot PRs, stop and say so. Otherwise list them in ascending number order: number, head branch, head SHA, draft flag, title.
   - Ask me before including a Dependabot PR that is a draft, targets a base other than main, comes from a fork (`isCrossRepository`), or carries a commit not authored by `dependabot[bot]` (`gh pr view <n> --json commits`), which means someone else pushed to it.
   - Confirm each PR's head SHA equals `origin/<head branch>`.

2. **Create the integrator branch.** Name it `feat/deps-YYYYMMDD` (today's local date). If that name already exists locally or on GitHub: if it is fully contained in origin/main and has no open PR, delete it and recreate it; otherwise ask me. Create it in a new temporary worktree outside the checkout, without upstream tracking: `git worktree add --no-track -b <branch> <temp dir> origin/main`.

3. **Merge the PRs in ascending PR-number order**, one signed merge commit each:
   `git merge -S --no-ff --no-edit -m "Merge branch '<head branch>' of <HOST>:<REPO> into <branch>" -m "PR #<number>" origin/<head branch>`
   On a conflict:
   - `package.json`: for each conflicting version spec, take the newer one.
   - `package-lock.json`: do NOT regenerate it with `npm install`, which pulls in versions no PR asked for. Instead do a per-package 3-way merge of the `packages` map (base = merge-base, ours = HEAD, theirs = the PR): take whichever side changed an entry; where both changed it, take the higher version. Then drop any entry that is no longer reachable from the root. Afterwards `npm ls --package-lock-only --all` must exit 0, and `npm install --package-lock-only --ignore-scripts` must change nothing.
   - Known npm quirk: a local npm run can rewrite the lockfile root's `"vue": "*"` to `"latest"`. Always restore `"*"`, which is what main and Dependabot use.
   - Other files (`Cargo.lock`, workflows): keep both sides' intended updates; the newer version wins.
   - Commit the resolution as the merge commit itself (signed), with a short body line saying what conflicted and how it was resolved.

4. **Verify the integration.**
   - Every update each PR states ("Bumps/Updates X from A to B") is on the branch at that version or newer, and the old version appears nowhere in the lockfiles. For grouped PRs, use the summary table at the top of the PR description, because GitHub truncates long descriptions.
   - For every lockfile entry any PR changed, the branch has the same or a newer version. Nothing went backwards.
   - Every commit in `origin/main..HEAD` that isn't Dependabot's has a good signature (`G` in `git log --format=%G?`). Dependabot's commits are signed by GitHub; leave them as they are.
   - No commit message contains "Co-Authored-By", "Claude" or any AI mention.

5. **Run the same checks CI runs**, in the worktree, on the Node version that `engines.node` in package.json requires (check `node --version`; if it doesn't match, stop and tell me): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run generate`. All must exit 0. Two warnings are known and not failures: npm's install-scripts ("allowScripts") warning, and nitro-server's "cache-driver.mjs … could not be resolved" during generate.
   If a check fails:
   - Find which PR caused it, e.g. by temporarily reinstalling that package at its previous version with `npm install --no-save` and re-running the check.
   - Check whether that PR's own CI on GitHub failed the same way.
   - Stop and tell me the cause and the smallest fix options, e.g. a newer patch release that fixes the regression, or a one-line code fix.
   - Apply a fix only after I choose one. Commit it signed with a plain message (e.g. `npm install -D <pkg>@<version>` plus one line explaining why), then re-run all the checks.

6. **Push the branch:** `git push -u origin <branch>` (a normal push).

7. **Open the PR:** `gh pr create --base main --head <branch> --title "<title>" --body-file <file>`. The title is the branch name with the first letter capitalized and the dash replaced by a space (e.g. `Feat/deps 20261030`). The body lists the merged PRs in order with their bumps, how each conflict was resolved, any extra commit and why, and the local check results. No AI mention.

8. **Wait for the PR's GitHub checks.** Wait until the checks are registered, then run `gh pr checks <number> --watch`. Every check must pass (currently `test` and `tauri` from CI, plus `CodeQL`, `Analyze (actions)` and `Analyze (javascript-typescript)`), and the PR must be MERGEABLE / CLEAN. If GitHub says "This branch cannot be rebased due to conflicts", that is expected for this kind of branch and is not a blocker: a rebase would drop the merge commits that hold the conflict fixes. Main gets updated by fast-forward in step 11 instead.

9. **Start the Release rehearsal** on the integrator branch: `gh workflow run release.yml --ref <branch>`. A manually started run is a rehearsal and deploys or publishes nothing. Find the new run with `gh run list --workflow release.yml --branch <branch> --event workflow_dispatch --limit 1`, and confirm its head SHA equals the PR's head SHA.

10. **Monitor it:** `gh run watch <run id> --exit-status`, then list every job's conclusion. All jobs must be `success` (currently verify, pages, desktop on Windows, Linux and macOS, image, and release). If any job fails, stop and report the job and its failing step.

11. **Fast-forward main.** Re-fetch. Confirm that origin/main still equals BASE, that `origin/<branch>` equals the tested SHA, and that BASE is an ancestor of it. If main has moved, stop and ask me. Then run `git push origin <tested SHA>:refs/heads/main`. This is a normal push: it must report `BASE..SHA`, never "forced update".

12. **Confirm the landing.**
    - The integrator PR and every merged PR show MERGED (`gh pr view <n> --json state`).
    - Main's tip on GitHub is verified (`gh api repos/<REPO>/commits/main`, field `commit.verification.verified`).
    - No PR from this batch is still open. If one is, Dependabot probably pushed a new commit to it; report that.

13. **Clean up.** Remove the temporary worktree (`git worktree remove --force <temp dir>`; if that fails, e.g. on long paths inside `node_modules`, the worktree is still deregistered, so delete the directory itself). Confirm the integrator branch is fully contained in origin/main, then delete it on GitHub (`git push origin --delete <branch>`) and locally (`git branch -D <branch>`).

14. **Report** a short summary:
    - the PRs merged, any conflicts and how they were resolved, and any extra commits
    - the open PRs skipped because they aren't Dependabot's
    - the local check results
    - the PR link and its check results
    - the Release run link and its job results
    - main's old and new SHA
    - confirmation that every commit is signed and nothing mentions AI
    - that the rehearsal covered the SHA main now points at, so `/bump-release <patch|minor|major>` can ship it without another rehearsal
