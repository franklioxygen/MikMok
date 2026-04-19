import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initializeDatabase } from "./db/index.js";
import { jobWorkerService } from "./services/jobs/jobWorker.js";

initializeDatabase();
const app = createApp();
jobWorkerService.start();

app.listen(env.PORT, env.HOST, () => {
  console.log(`MikMok API listening on http://${env.HOST}:${env.PORT}`);
});
