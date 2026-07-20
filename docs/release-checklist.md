# Release Checklist

This checklist keeps releases reproducible and gives maintainers one place to verify source, artifacts, and publication metadata.

## 1. Identity and rights

- [ ] Confirm the public repository owner, package maintainer identity, and copyright holder.
- [ ] Confirm the repository and package names are available and do not knowingly conflict with another product or trademark.
- [ ] Add real `repository`, `homepage`, and `bugs` metadata to `package.json` after the remote URL exists.
- [ ] Review every changed file for local paths, credentials, learner data, copied questions, and unlicensed assets.
- [ ] Confirm every example and imported contribution has documented redistribution rights.
- [ ] Confirm source, content, third-party, and trademark notices remain separate and accurate.

## 2. Reproducible verification

- [ ] Use a clean checkout with the Node versions declared in `COMPATIBILITY.md`.
- [ ] `npm ci` succeeds from the committed lockfile.
- [ ] `npm run check` passes.
- [ ] `npm run audit:dependencies` reports no unresolved high-severity findings.
- [ ] Runtime dependency count is zero.
- [ ] The hosted Node 22/24 CI matrix passes on the exact release commit.

## 3. Package inspection

- [ ] `npm run package:local` creates the tarball, checksum, and JSON manifest.
- [ ] Fresh-consumer install, root/subpath ESM imports, and the installed example pass.
- [ ] `release/manifest.json` lists all expected checks.
- [ ] `shasum -a 256 -c release/SHA256SUMS.txt` passes from the release directory.
- [ ] `npm pack --dry-run --ignore-scripts` contains only approved public files.
- [ ] Source maps, declarations, examples, documentation, and license files are present and usable.
- [ ] No development-only directory, test fixture, coverage output, credential, or local absolute path is packed.

## 4. Public release

- [ ] Enable private vulnerability reporting and branch protection on the remote repository.
- [ ] Review `CHANGELOG.md`, API stability, compatibility, and migration notes.
- [ ] Create a signed or otherwise verified release tag from the green commit.
- [ ] If publishing to npm, use a maintainer account with MFA and provenance enabled.
- [ ] Verify the registry tarball checksum and a fresh install independently after publication.
- [ ] Announce only after the repository, package, documentation links, and security channel are live.

## 5. Stop conditions

Stop the release if provenance is unclear, a sensitive value is found, CI differs from the local artifact, the package name is disputed, or a security report remains unresolved.
