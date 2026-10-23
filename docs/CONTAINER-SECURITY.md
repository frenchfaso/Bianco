# Container security refresh — 2026-10-22

These changes affect local container recipes only. They do not deploy to or
change the Galaxy A15, Termux Stacks, Karonte, application data or authentication.

## Updated components

- Node.js 24.22.1 on Alpine 3.23 includes the October 21 Node security release.
- Python 3.13.17 on Debian trixie includes the emergency pip/certificate update.
  The API refreshes Debian packages, requires `ca-certificates` at least
  `20250419+deb13u1`, and updates pip (at least 26.2.2) and certifi (at least
  2026.10.19). Bookworm was replaced after checking CVE-2026-84782: its available
  OpenSSL 3.0.22 package was still vulnerable, whereas trixie's
  `3.5.7-1~deb13u3` is the Debian-fixed revision. The rebuilt API's installed
  revision and system/certifi TLS paths were checked. A stale mirror must fail
  the CA version guard rather than silently retaining the old trust store.
- Alpine build/runtime stages require `ca-certificates>=20261020-r0` and apply
  available Alpine package upgrades.
- Caddy is updated to 2.11.7 and rebuilt using the official builder index
  `sha256:ef9b65adf9a224770c6d5f6d1ae1bf99bc3caaa78d8c4bae3ea949ee6984f301`.
  Its arm64 configuration was checked to contain Go 1.27.3. Do not assume a
  runtime image refresh recompiles the downloaded upstream Caddy binary.
  `CGO_ENABLED=0` keeps the replacement binary portable across the builder and
  runtime Alpine versions. The privileged-port capability is restored. The final
  runtime is a minimal Alpine 3.24 image, not the official Caddy runtime image:
  the latter still includes curl/libcurl 8.22.0 affected by CVE-2026-92392.
  Caddy does not need those libraries, so neither is installed in the final
  image. Runtime paths, Caddy command, MIME data and XDG configuration/data paths
  are preserved. Use an external probe or BusyBox for private HTTP checks, not
  a curl command inside this runtime.

The ordinary `deps`, `development`, `build`, `test` and `production` targets and
application startup commands are preserved.

## Build in the replacement Podman VM

From the Bianco repository root:

```sh
podman build --pull=always --no-cache --target production \
  -f server/Dockerfile -t localhost/bianco-api:security-refresh server
podman build --pull=always --no-cache --target production \
  -f client/Dockerfile -t localhost/bianco-web:security-refresh client
```

These verification tags do not replace existing Compose images. Rebuild Compose
services through their own build workflow after functional validation; do not
start production services or reuse real credentials just to test the recipes.

## Validation and limitations

The public base-image manifests, builder Go version, Alpine CA availability and
Debian security package versions were checked on 2026-10-22. Fresh builds in the
replacement VM passed on 2026-10-23. The original local project tags
`docker.io/library/bianco-test-test-api:latest` and
`docker.io/library/bianco-test-test-web:latest` now refer to those rebuilt images;
no image was pushed to a registry.

Verification passed: 145 API tests, 82 client tests, Caddy configuration
validation, compiled Caddy Go 1.27.3 provenance, and an isolated production
startup test (API migration/health plus Caddy serving the built frontend).
The integration network was internal-only, no host ports or data volumes were
created, and test containers/network were removed. The final trixie API passed
all 145 tests again. Python system/certifi paths and Caddy's own Go reverse-proxy
TLS path rejected all four compromised chains and accepted valid controls.
Caddy's rejection was confirmed by X.509 errors in its logs, not by interpreting
an arbitrary HTTP/network failure as success. No phone or remote host was
deployed. Android/Termux/PRoot behavior was not requalified by these Linux VM tests.

At the time of the container refresh, outstanding dependency advisories remained:
npm audit reported three high and
three moderate advisories in the full development dependency tree; the
production-only dependency audit reported one moderate advisory in `fast-uri`
and no high/critical advisories. No automatic package.json/lockfile mutation
was performed. The pinned cryptography 49.0.0 wheel also reports an embedded
OpenSSL 4.0.1: updating Debian's OpenSSL does not replace that separate library.
Its applicable code paths/advisories need a separate dependency review; the
patched Python system TLS library is not a blanket certification of that wheel.
Browser E2E and a complete image vulnerability scan were not run.
Updating these application dependencies is a separate follow-up from refreshing
the image bases. The guest VM's own pending curl/OpenSSL OS updates are also
separate from the container package updates.

## Application dependency follow-up — 2026-10-23

The dependency follow-up now pins Pillow 13.0.0, Vite 8.1.6, Vitest 4.1.12,
and cryptography 50.0.2. Targeted lockfile updates also patch `brace-expansion`,
`fast-uri`, and `source-map-js`. This supersedes the npm/Python dependency
findings above, not the container or host operating-system review.

Validation passed: clean `npm ci`, lint, production/PWA build, 82 client unit
tests, and 145 API tests with the final Python dependencies in an isolated
Python 3.14 environment. Both complete and production-only npm audits report
zero vulnerabilities; `pip check` passes and `pip-audit -r
server/requirements.txt` reports no known vulnerabilities. Browser E2E,
container rebuilds, and remote deployment were not repeated for this follow-up.

Pillow 13 requires Python 3.11 or newer; CI 3.12 and the Dockerfile's 3.13 meet
that requirement. The cryptography advisory concerns PKCS#7 decryption, while
Bianco uses Fernet. Its dependency is patched nevertheless; 50.0.2 wheels also
bundle OpenSSL 4.0.3. Dependency audit results are not a complete scan of bundled
native libraries or a certification that every upstream advisory is applicable.

Sources: [Pillow 13 security notes](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html),
[Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22),
[Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8),
[cryptography advisory](https://github.com/pyca/cryptography/security/advisories/GHSA-g6cj-pr64-35w5).

After building:

1. Record Node, Python, pip, certifi, Caddy and Go build versions.
2. Exercise actual TLS paths in the images, including Python's system store and
   certifi/httpx. The eMudhra test chains must fail specifically with certificate
   errors; a DNS failure or timeout is inconclusive. A known-good HTTPS control
   must succeed. Never use `--insecure` or disable peer verification.
3. Run the project's API/client tests and Caddy configuration validation.
4. Scan the final images and application dependencies for remaining advisories.
   These recipe updates are not a claim that every dependency is vulnerability-free.

Use fresh pulls and no build cache for security rebuilds. Exact language/compiler
patches and the pinned builder digest need deliberate maintenance when upstream
security releases change. Restoring an old image archive restores old libraries;
it is a recovery fallback, not the security upgrade.

References:

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://www.python.org/downloads/release/python-31317/
- https://packages.debian.org/bookworm/ca-certificates
- https://bugs.debian.org/1151413
- https://emudhra.we-have-a-problem.com/
