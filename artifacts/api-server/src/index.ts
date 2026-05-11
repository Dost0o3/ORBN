import app from "./app";
import { logger } from "./lib/logger";
import { startDirectMessagesCleanupJob } from "./lib/dm-cleanup";
import { startProfileImagesCleanupJob } from "./lib/profile-image-cleanup";
import { startAgentRetryWorker } from "./lib/agent-retry";
import { rehydrateDmExpiryTimers } from "./lib/dm-helpers";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startDirectMessagesCleanupJob();
  startProfileImagesCleanupJob();
  startAgentRetryWorker();
  void rehydrateDmExpiryTimers().catch((err) => {
    logger.warn({ err }, "Failed to rehydrate DM expiry timers");
  });
});
