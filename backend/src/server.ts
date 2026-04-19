import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initializeDatabase } from "./db/index.js";
import { jobWorkerService } from "./services/jobs/jobWorker.js";
import { videoIndexService } from "./services/library/videoIndex.js";
import { metadataExtractor } from "./services/media/metadataExtractor.js";

initializeDatabase();

async function bootstrap() {
  if (await metadataExtractor.isAvailable()) {
    const repairedVideoIds = videoIndexService.repairLegacyDirectPlaybackCandidates();

    if (repairedVideoIds.length > 0) {
      console.log(`Repaired ${repairedVideoIds.length} legacy direct-play video classifications.`);
    }
  }

  const app = createApp();
  jobWorkerService.start();

  const pendingTranscodeVideoIds = videoIndexService.listPendingTranscodeVideoIds();

  if (pendingTranscodeVideoIds.length > 0) {
    await jobWorkerService.enqueueTranscodes(pendingTranscodeVideoIds);
  }

  app.listen(env.PORT, env.HOST, () => {
    console.log(`MikMok API listening on http://${env.HOST}:${env.PORT}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to bootstrap MikMok API.", error);
  process.exit(1);
});
