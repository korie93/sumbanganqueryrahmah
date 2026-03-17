import "dotenv/config";
import { createLocalRuntimeEnvironment } from "./internal/local-runtime-environment";

const { app } = createLocalRuntimeEnvironment();

export default app;
