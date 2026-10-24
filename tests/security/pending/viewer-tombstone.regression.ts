// The former service-double assertion required an early lookup and could not
// validate a fix at the database boundary. Use the real PostgreSQL regression:
// it checks both aliases, headers/counts/fallbacks and a retained page cursor.
// It runs only with SQR_AUTH_ISOLATED_CLUSTER in a disposable test database.
import "../../../server/repositories/tests/viewer-import-lifecycle.postgres.test";
