---
description: Bump the app version (patch, minor or major), sign and tag it, land it on main, and watch the tag-triggered Release deploy it and draft the GitHub Release
argument-hint: patch|minor|major
---

# Task: release a new version (`$ARGUMENTS` bump)

Cut a new release of this repository: bump the version, commit and tag it signed, land it on main, and see the Release workflow deploy it and draft the GitHub Release — end to end. Publishing that draft is my job, not yours. Work from this repository's local clone. Tell me briefly what you are doing at each step. If any check or gate below fails, stop at that point and report what failed and why.

The bump is `$ARGUMENTS`. It must be exactly one of `patch`, `minor` or `major`. If it's anything else, or empty, stop and ask me which one.

## How a release works here
Background for the steps below. Don't change any of it as part of a release.
- `version` in `package.json` is the one source of the app version, and every build reads it. `nuxt.config.ts` bakes it into `runtimeConfig.public.version`, which the UI shows as the version pill, and the same goes for Docker builds. `src-tauri/tauri.conf.json` has `"version": "../package.json"`, so the desktop installers, their file names, the Windows exe metadata and Rust's `app.package_info().version` all come from it, and the release workflow names the portable zip after it too.
- `version` in `src-tauri/Cargo.toml` is crate metadata that nothing shipped reads. A release leaves it, and `Cargo.lock`, alone.
- Because of `.npmrc` (`tag-version-prefix=v`, `sign-git-tag=true`, `message=Release v%s`), `npm version <bump>` is the whole local step. It sets `version` in `package.json` and in `package-lock.json` (the top level and `packages[""]`), commits those two files as `Release vX.Y.Z`, and creates an annotated, signed tag `vX.Y.Z` with that same message. It refuses to run in a dirty working tree. It needs no `node_modules`.
- Nothing happens on GitHub until a push. When the commit reaches main, CI (`test`, `tauri`) and CodeQL run on it. When the tag arrives, `.github/workflows/release.yml` (`on: push: tags: v*`) runs:
  - `verify` refuses to continue unless the tagged commit is on main, so main must already have the commit when the tag lands.
  - `pages` builds the site and deploys it to GitHub Pages.
  - `desktop` builds the Windows (`.msi` + portable `.zip`), Linux (`.AppImage`) and macOS (`.dmg`) apps.
  - `image` builds the multi-arch container image and pushes it to GHCR as `X.Y.Z`, `X.Y` and `latest`, with the version taken from the tag.
  - `release` creates the GitHub Release `vX.Y.Z` as a **draft**, with the installers, `SHA256SUMS.txt` and generated notes. Nobody else can see it until I publish it. Pages and the GHCR image don't wait for that: they're live as soon as their jobs finish.
- A manually dispatched Release run is a rehearsal: it builds every job but deploys, pushes and publishes nothing.
- The `protect-release-tags` ruleset (`.github/rulesets/`) blocks deleting or moving `v*` tags, so a pushed tag is final. If a release fails after its tag is pushed, re-run the workflow, or fix main and release the next patch. Never move the tag. `protect-main` blocks force-pushing and deleting main.

## Hard rules
- The release commit and its tag must both be signed with my configured signing key. If signing fails, stop. Never fall back to an unsigned commit or a lightweight/unsigned tag.
- Never mention Claude, AI, or any assistant anywhere: not in the commit, the tag, or anything posted to GitHub. The commit message and the tag message are exactly `Release vX.Y.Z`.
- The release commit changes only the version fields that `npm version` sets. Don't hand-edit them, don't run `npm install` (it can rewrite the lock root's `"vue": "*"` to `"latest"`), and don't touch `Cargo.toml` or `Cargo.lock`.
- Never force-push main. Never delete or move a tag on GitHub. Never use GitHub's merge buttons, create the GitHub Release by hand, or change repository settings or rulesets.
- Never publish, edit or delete the draft release. I review it and publish it myself.
- Do not touch my current checkout, its branch or its uncommitted changes. Do all work in a separate temporary git worktree.

## Tools
This needs `git`, `npm` and the GitHub CLI (`gh`, used for everything on GitHub). Don't assume an OS, shell or install location: find the tools on PATH, and if one is missing, or `gh` isn't signed in with push access to the repository, stop and tell me. Keep commands shell-neutral — prefer `gh … --json <fields>` and read the JSON yourself over shell-specific quoting and pipelines — and judge success by exit codes, not by formatted output. Waits on GitHub (`gh run watch`) can take well over ten minutes; run them so a command timeout doesn't cut them off.

## Steps

1. **Preflight.**
   - `git fetch origin --prune --tags`; `gh auth status`. Record the repository as REPO (`owner/name`, from `gh repo view --json nameWithOwner`) and the SHA of origin/main as BASE.
   - A signing key must be configured (`git config --get user.signingkey`). If it isn't, stop and ask me.
   - Read `version` from `package.json` on origin/main (`git show origin/main:package.json`) as CURRENT. The newest `v*` tag reachable from origin/main (`git describe --tags --abbrev=0 --match "v*" origin/main`) must be `vCURRENT`. If it isn't, e.g. because a bump was never tagged or a tag has no matching bump, stop and show me.
   - Work out NEXT from CURRENT under semver: for `0.4.7`, patch gives `0.4.8`, minor gives `0.5.0`, and major gives `1.0.0`. `vNEXT` must not exist locally (`git rev-parse -q --verify refs/tags/vNEXT`) or on GitHub (`git ls-remote --tags origin refs/tags/vNEXT`).
   - List the commits since the last release: `git log --oneline vCURRENT..origin/main`. If there are none, stop and ask me whether to release anyway.

2. **Gate on main's checks.** Every check run on BASE must have completed as `success`, `neutral` or `skipped` (`gh api repos/<REPO>/commits/<BASE>/check-runs --paginate`). That includes at least CI's `test` and `tauri` and CodeQL's two `Analyze (…)` jobs. If some are still running, wait for them (`gh run list --commit <BASE>`, then `gh run watch <id> --exit-status`). If any failed, or there are none, stop and report.

3. **Gate on a Release rehearsal of BASE.** A successful rehearsal of this exact SHA shows the tag-triggered run will build: `gh run list --workflow release.yml --commit <BASE> --event workflow_dispatch --status success --limit 1`. `/integrate-dependabot` leaves one behind for the SHA it fast-forwards main to. If there isn't one, run it on main with `gh workflow run release.yml --ref main`, which also warms main's Rust cache. Find the run with `gh run list --workflow release.yml --branch main --event workflow_dispatch --limit 1`; its head SHA must equal BASE. Watch it with `gh run watch <id> --exit-status`. Every job must end `success`. If one doesn't, stop and report the job and its failing step.

4. **Bump in a temporary worktree.** Create a detached worktree outside the checkout with `git worktree add --detach <temp dir> <BASE>`. In it, run `npm version $ARGUMENTS --sign-git-commit`, which prints `vNEXT`. If it prints something else, or fails partway (e.g. it made the commit but couldn't sign the tag), stop. Delete any local `vNEXT` tag it created (`git tag -d vNEXT`); it hasn't been pushed. Then remove the worktree, which also discards the unpushed commit, and report.

5. **Verify the commit and tag** before anything leaves the machine.
   - HEAD's message is exactly `Release vNEXT`, its only parent is BASE, and it has a good signature (`G` in `git log -1 --format=%G?`).
   - `git diff BASE HEAD` touches only `package.json` and `package-lock.json`. It changes only `"version"` lines, from CURRENT to NEXT: one in `package.json` and two in `package-lock.json`. The lock root still has `"vue": "*"`.
   - `git cat-file -t vNEXT` prints `tag`, so the tag is annotated. `vNEXT^{commit}` resolves to HEAD, the tag message is `Release vNEXT`, and `git verify-tag vNEXT` exits 0.
   - Record HEAD as RELEASE.

6. **Push main and the tag together.** Re-fetch first. origin/main must still equal BASE. If it has moved, stop and ask me: the release has to be redone on the new main, so delete the local `vNEXT` tag and start over from step 1. Then push both with one atomic, normal push: `git push --atomic origin <RELEASE>:refs/heads/main refs/tags/vNEXT`. GitHub accepts both refs or neither, so main is never bumped without its tag, and the tag never arrives before main has its commit. The push must report `BASE..RELEASE` for main and `[new tag]` for the tag, and never "forced update". If it's rejected, nothing changed on GitHub: stop and report.

7. **Watch the release.** Wait until the tag's Release run is registered (`gh run list --workflow release.yml --event push --commit <RELEASE> --limit 1`; its head branch is `vNEXT`). Then watch it with `gh run watch <id> --exit-status` and list every job's conclusion. All must be `success` (currently verify, pages, desktop on Windows, Linux and macOS, image, and release).
   If a job fails, remember the tag is already public and can't be moved. Stop and report the failing job and step with the options. If the failure looks transient (runner, network, registry), re-run the failed jobs with `gh run rerun <id> --failed`; the pages job already copes with re-runs. If it's a real defect, fix it on main and release the next patch. If `verify` failed with "not on main", main was missing the commit, and a re-run fixes it. Wait for my choice before re-running anything.

8. **Confirm it shipped.**
   - `gh release view vNEXT --json tagName,isDraft,isPrerelease,url,assets`: exactly one release exists for `vNEXT`, and it is a draft (`isDraft` true) that isn't a prerelease. Its assets are the `SHA256SUMS.txt` plus the installers that the "Verify the expected artifacts exist" step in `release.yml` requires: `.msi` and portable `.zip`, `.AppImage`, `.dmg`. Each installer has NEXT in its file name.
   - Main's tip on GitHub is RELEASE and verified (`gh api repos/<REPO>/commits/main`, fields `sha` and `commit.verification.verified`).
   - The CI and CodeQL runs on RELEASE all succeeded (`gh run list --commit <RELEASE>`; wait for any still running).

9. **Clean up.** Remove the temporary worktree (`git worktree remove --force <temp dir>`; if that fails, delete the directory itself). Leave my checkout alone, even though its local `main` is now behind origin/main.

10. **Report** a short summary:
    - CURRENT → NEXT and the bump type
    - the commits the release includes (`vCURRENT..BASE`)
    - the rehearsal run that gated it (link)
    - RELEASE and `vNEXT`, both confirmed signed, with no AI mention anywhere
    - the Release run link and its job results
    - the draft GitHub Release link and its assets, waiting for me to review and publish it
    - main's old and new SHA
    - that my checkout's `main` is behind and needs `git pull --ff-only`
