const REGRESSION_LOOPBACK_URL = "http://127.0.0.1:5000";

export function buildRegressionTestEnv(sourceEnv) {
  const {
    COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS: _collectionPiiEncryptionKeyPrevious,
    COLLECTION_PII_RETIRED_FIELDS: _collectionPiiRetiredFields,
    DATABASE_SSL: _databaseSsl,
    DATABASE_SSL_CA: _databaseSslCa,
    DATABASE_SSL_CA_FILE: _databaseSslCaFile,
    SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL: _sessionJwtLegacyHs256VerifyUntil,
    SESSION_JWT_PRIVATE_KEY: _sessionJwtPrivateKey,
    SESSION_JWT_PUBLIC_KEY: _sessionJwtPublicKey,
    SQR_DB_BOOTSTRAP_MODE: _databaseBootstrapMode,
    VERIFY_COLLECTION_PII_FULL_RETIREMENT: _verifyCollectionPiiFullRetirement,
    VERIFY_COLLECTION_PII_SENSITIVE_RETIREMENT: _verifyCollectionPiiSensitiveRetirement,
    ...regressionTestEnv
  } = sourceEnv;

  return {
    ...regressionTestEnv,
    // Keep regression children deterministic even when release readiness is
    // launched from a copied production/server .env file.
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PUBLIC_APP_URL: REGRESSION_LOOPBACK_URL,
    APP_BASE_URL: REGRESSION_LOOPBACK_URL,
    CLIENT_APP_URL: REGRESSION_LOOPBACK_URL,
    CORS_ALLOWED_ORIGINS: REGRESSION_LOOPBACK_URL,
  };
}
