# Dependency Security Notes

Last reviewed: 2026-09-25

## Current audit result

`npm audit --omit=dev` reports two production dependency findings through
`next@15.5.26 -> postcss`:

- Dependency: `postcss <= 8.5.22` (transitive dependency of Next.js)
- Severity: one high and one moderate finding
- Advisories:
  - `GHSA-qx2v-qp2m-jg93`: unescaped `</style>` in CSS stringify output
  - `GHSA-6g55-p6wh-862q`: source map arbitrary file read
  - `GHSA-fxqj-rqcc-2cmp`: incomplete source map fix
  - `GHSA-r28c-9q8g-f849`: source map path traversal/file disclosure

## Current impact

The PoC uses static, repository-controlled Tailwind CSS and does not accept
user-provided CSS, PostCSS source maps, or arbitrary stylesheet source paths.
The vulnerable PostCSS path is used during the application build rather than
as an exposed request-time CSS transformation service.

The current practical exposure is therefore limited, but not zero:

- A malicious contributor or compromised build input could target build-time
  processing.
- Running builds against untrusted CSS or source maps would increase impact.
- The finding remains present in the production dependency graph and must not
  be treated as resolved.

## Mitigation

- Do not process uploaded or otherwise untrusted CSS/source maps.
- Build only from reviewed repository content in a controlled environment.
- Keep deployment credentials unavailable to untrusted build scripts.
- Continue running `npm audit --omit=dev` before releases.
- Do not use `npm audit fix --force`; it currently proposes a breaking Next.js
  major upgrade.

## Upgrade plan

The automated remediation upgrades Next.js to 16.x. This PoC remains on
Next.js 15.5.x until an explicit compatibility task validates:

1. App Router and Route Handler behavior
2. ESLint configuration migration
3. React and TypeScript compatibility
4. ClinicalTrials.gov search, pagination, and local persistence regression
5. Production build and browser smoke tests

After those checks, upgrade Next.js and confirm that the PostCSS advisories are
removed from `npm audit --omit=dev`.
