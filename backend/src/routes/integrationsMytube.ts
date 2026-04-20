import { Router } from "express";

import { myTubeAdapterService } from "../services/integrations/mytubeAdapter.js";
import { pipeUpstreamResponse } from "../utils/proxy.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const integrationsMytubeRouter = Router();

integrationsMytubeRouter.get("/authors", async (_request, response) => {
  sendSuccess(response, await myTubeAdapterService.listAuthors());
});

integrationsMytubeRouter.get("/authors/:authorKey/videos", async (request, response) => {
  sendSuccess(response, await myTubeAdapterService.listVideosByAuthor(request.params.authorKey));
});

integrationsMytubeRouter.get("/authors/:authorKey", async (request, response) => {
  const author = await myTubeAdapterService.findAuthor(request.params.authorKey);

  if (!author) {
    throw new AppError(404, "AUTHOR_NOT_FOUND", "Author not found.");
  }

  sendSuccess(response, author);
});

integrationsMytubeRouter.get("/assets/avatar/:sourceId/:videoId", async (request, response) => {
  const upstreamResponse = await myTubeAdapterService.fetchAuthorAvatar(
    request.params.sourceId,
    request.params.videoId,
    request
  );

  await pipeUpstreamResponse(upstreamResponse, response);
});
