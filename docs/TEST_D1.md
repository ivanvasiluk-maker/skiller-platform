# Isolated test D1

Round 0.4 adds a local-only D1 gate. It applies every migration to an empty
database, checks the core tables, writes one synthetic user, reads it back, and
deletes the temporary state.

## Run the smoke gate

```bash
npm run test:d1
```

The command uses only `wrangler.test.jsonc`, the fixed database name
`skiller-d1-test`, a placeholder database ID, and a new temporary persistence
directory. It contains no account ID, production database ID, token, or secret.

`npm run verify` includes this gate after the core unit tests. GitHub CI runs the
same order before the production build.

## Local seed and reset

Persistent local test data lives only under `.wrangler/skiller-d1-test` and is
ignored by Git. Administrative operations require all three safeguards:

1. `SKILLER_ENV` is exactly `test`;
2. the config filename is exactly `wrangler.test.jsonc`;
3. the database name and placeholder ID match the test-only constants.

Examples for a POSIX shell:

```bash
SKILLER_ENV=test npm run test:d1:seed
SKILLER_ENV=test npm run test:d1:reset
```

Without the explicit environment guard, both commands fail before changing any
database state. Production IDs and secrets must never be added to the test
config or documentation.
