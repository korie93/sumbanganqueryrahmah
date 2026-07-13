const path = require("node:path");

const releaseRoot = process.env.SQR_RELEASE_ROOT || "/home/deploy/apps/sqr-runtime";
const nodeExtraCaCerts = process.env.NODE_EXTRA_CA_CERTS;

module.exports = {
  apps: [
    {
      name: process.env.SQR_PM2_APP_NAME || "sqr",
      cwd: path.join(releaseRoot, "current"),
      script: "dist-local/server/cluster-local.js",
      interpreter: "node",
      wait_ready: true,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "5000",
        GRACEFUL_SHUTDOWN_TIMEOUT_MS: "10000",
        ...(nodeExtraCaCerts ? { NODE_EXTRA_CA_CERTS: nodeExtraCaCerts } : {}),
      },
      max_memory_restart: "768M",
      node_args: "--max-old-space-size=600",
      min_uptime: "15s",
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      restart_delay: 5000,
      kill_timeout: 15000,
      listen_timeout: 5000,
      time: true,
    },
  ],
};
