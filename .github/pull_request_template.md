## What and why

<!-- One or two sentences. Task id(s): T## -->

## How it was tested

- [ ] `npm run check` (typecheck, lint, unit tests, `db:verify`, secret scan) is green
- [ ] `npm run build` is green
- [ ] Checked in the browser (desktop + 375 px; Arabic RTL if UI)

## Safety checklist

- [ ] No keys, tokens, passwords, `.env.local`, `.data/` or real personal data in the diff, the PR text or the screenshots
- [ ] New tables/functions have RLS, policies and minimal grants (and checks in `scripts/db/verify.mjs`)
- [ ] Server actions/routes re-check the signed-in owner; inputs validated with zod
- [ ] Honesty labels kept (SAMPLE data, test money, AI estimate)
- [ ] Touches shared files (layout, header, globals.css, package.json, DECISIONS)? The other team is tagged
- [ ] `docs/IMPLEMENTATION_PLAN.md` status + `docs/HANDOFF.md` "Last changes" updated
