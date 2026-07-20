# Troubleshooting

## `npm run lint` fails

The repository uses the non-interactive ESLint CLI with `--max-warnings=0`. Resolve warnings and errors rather than suppressing them; CI should run the same command.

## Edge-runtime warning during build

The build traces `process.version` through Supabase from middleware. The build succeeds, but resolve the warning or validate/pin the exact dependency and target-host combination before launch.

## Migration timeout

Do not repeatedly reset production. Confirm linked project, credentials, network path, and direct/pooler mode. Run `supabase db push --dry-run` and use the target project's documented connection string.

## New auth user has no profile/team

Verify all migrations, then inspect `on_auth_user_created` and bootstrap functions in database logs. Test repairs on staging first.

## Worker dispatch fails or stays queued

Confirm matching `WEBHOOK_SECRET`, worker deployment, and Supabase URL. Inspect the start response, function logs, `research_runs`, `research_stages`, and `error_logs`. Confirm no database webhook duplicates dispatch. Dispatch rejection should mark the run `Failed`.

If the worker returns `name resolution failed`, confirm the Edge runtime can resolve and reach `SUPABASE_URL`, and that `SUPABASE_SERVICE_ROLE_KEY` is configured for both `research-worker` and `research-scheduler`. This is an environment networking fault: fix it, then invoke the scheduler rather than manually claiming or completing a run.

For local Supabase, do not set the Edge Function's `SUPABASE_URL` to a Docker-only hostname from the host shell. Let the Supabase runtime provide its container-resolvable URL, and configure host scripts with the CLI's public local URL. Confirm the worker and scheduler have `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`, and `GEMINI_API_KEY`; then run `npm run smoke:worker` and `npm run smoke:scheduler`. The worker smoke creates a real reservation, claims canonical `plan`, verifies cancellation, and asserts exactly-once credit restoration.

## Normalized output fails validation

The provider omitted required competitors, risks, pricing, MVP, launch, or citations after retries. A terminal failure is correct; never substitute fixture data. Safely capture a redacted fixture and harden the structured-output contract.

## Export returns 409 or 403

For 409, confirm the latest report version has the requested export row and Storage object. The route now normalizes PostgREST object/array relation shapes; add route tests for all formats. For 403, verify session, ownership, object path, and private bucket policy. Never make the bucket public or expose service-role URLs.

## Provider/cost-cap failure

Inspect `api_usage_logs` and `error_logs`. Missing keys, exhausted retries, and cost limits must fail visibly. Adjust budgets deliberately after reviewing unit economics; do not globally disable the cap to clear one run.
