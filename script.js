require("dotenv").config();
const axios = require("axios");
const cron = require("node-cron");
const dayjs = require("dayjs");
const {
  refreshAccessToken,
  getStoredTokens,
  getAccessToken,
} = require("./tokenManager");
const fs = require("fs");

// Check that the required environment variables are present
const requiredEnvVars = [
  "TRAKT_CLIENT_ID",
  "SONARR_API_KEY",
  "RADARR_API_KEY",
  "SONARR_URL",
  "RADARR_URL",
  "TEMP_TAG_ID_RADARR",
  "TEMP_TAG_ID_SONARR",
];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
});

// Environment variables
const DEBUG = process.env.DEBUG === "true";
const WATCHED_DAYS_THRESHOLD =
  parseInt(process.env.WATCHED_DAYS_THRESHOLD, 10) || 30;
const MAX_DAYS_THRESHOLD = parseInt(process.env.MAX_DAYS_THRESHOLD, 10) || 90;

// Log colors for console output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
};

// Logging functions
const log = {
  error: (message, ...args) =>
    console.error(`[${colors.red}❌ ERROR${colors.reset}] ${message}`, ...args),
      `[${colors.red}❌ ERREUR${colors.reset}] ${message}`,
      ...args
    ),
  info: (message, ...args) =>
    console.log(`[${colors.blue}ℹ️ INFO${colors.reset}] ${message}`, ...args),
  debug: (message, ...args) =>
    DEBUG &&
    console.log(
      `[${colors.magenta}🐛 DEBUG${colors.reset}] ${message}`,
      ...args
    ),
  success: (message, ...args) =>
    console.log(
      `[${colors.green}✅ SUCCESS${colors.reset}] ${message}`,
      ...args
    ),
  warning: (message, ...args) =>
    console.warn(
      `[${colors.yellow}⚠️ WARNING${colors.reset}] ${message}`,
      ...args
    ),
};

// Schedule a cron job to refresh the access token every 3 months
cron.schedule("0 0 1 */3 *", async () => {
  log.info("Starting cron for token refresh...");
  log.info("Lancement du cron pour rafraîchissement des tokens...");
  try {
    const tokens = getStoredTokens();
    if (tokens?.refresh_token) {
      await refreshAccessToken(tokens.refresh_token);
      log.success("Access token successfully refreshed.");
    } else {
      log.error("Refresh token not found.");
    }
  } catch (error) {
    log.error(`Error during token refresh: ${error.message}`);
  }
});

// Schedule a daily cron job to clean up watched media
cron.schedule("0 0 * * *", async () => {
  log.info("Starting cron for media cleanup...");
  try {
    await main();
  } catch (error) {
    log.error(`Error during media cleanup: ${error.message}`);
  }
});

// Retrieve watched movies and series from Trakt
async function getWatchedItems() {
  const tokens = getStoredTokens();
  if (!tokens?.access_token) {
    log.error(
      `Access token not found. Please obtain a new token by running the script npm run start`
    );
    return [];
  }

  try {
    // Calculate the start date based on the WATCHED_DAYS_THRESHOLD
    const startDate = dayjs().subtract(MAX_DAYS_THRESHOLD, "day").toISOString();

    // Calculate the end date based on the WATCHED_DAYS_THRESHOLD
    const endDate = dayjs()
      .subtract(WATCHED_DAYS_THRESHOLD, "day")
      .toISOString();

    // Retrieve watched series
    const watchedShows = await axios.get(
      `https://api.trakt.tv/users/me/watched/shows`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "trakt-api-key": process.env.TRAKT_CLIENT_ID,
          "Content-Type": "application/json",
        },
      }
    );

    // Retrieve watched movies
    const watchedMovies = await axios.get(
      `https://api.trakt.tv/users/me/watched/movies`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "trakt-api-key": process.env.TRAKT_CLIENT_ID,
          "Content-Type": "application/json",
        },
      }
    );

    return [...watchedShows.data, ...watchedMovies.data].filter((item) => {
      const lastWatched = item.last_watched_at || item.last_collected_at;
      return (
        new Date(lastWatched) >= new Date(startDate) &&
        new Date(lastWatched) <= new Date(endDate)
      );
    });
  } catch (error) {
    log.error(`Error while retrieving watched items: ${error.message}`);
      `Erreur lors de la récupération des éléments regardés : ${error.message}`
    );
    return [];
  }
}

// Check if the media is tagged as "temp" in Sonarr/Radarr
async function isTempTagged(
  serviceUrl,
  apiKey,
  mediaId,
  mediaType = "series",
  title
) {
  try {
    const endpoint = mediaType === "series" ? "tvdb" : "tmdb";

    const { data } = await axios.get(
      `${serviceUrl}/api/v3/${mediaType === "series" ? "series" : "movie"}${
        mediaType === "series"
          ? `?${endpoint}Id=${mediaId}`
          : `?${endpoint}Id=${mediaId}`
      }`,
      {
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      }
    );

    const tempTagId =
      mediaType === "series"
        ? parseInt(process.env.TEMP_TAG_ID_SONARR, 10)
        : parseInt(process.env.TEMP_TAG_ID_RADARR, 10);

    const isTagged =
      mediaType === "series"
        ? data[0]?.tags?.includes(tempTagId)
        : data[0]?.tags?.includes(tempTagId);

    if (!data || data?.length === 0) {
      log.debug(`${title} ${colors.yellow}not found${colors.reset}.`);
    } else if (data && data.length > 0 && !isTagged) {
      log.debug(
        `${title} is not tagged "temp", ${colors.green}kept${colors.reset}.`
      );
    }

    return isTagged;
  } catch (error) {
    log.debug(
      `Tag "temp" for ${title} (#${mediaId}) not found: ${error.message}`
    );
    return false;
  }
}

// Function to delete media from Sonarr/Radarr with options deleteFiles and addImportExclusion
async function deleteFromService(
  serviceUrl,
  apiKey,
  mediaType = "series",
  mediaInfo,
  media
) {
  try {
    if (mediaType === "series") {
      const episodes = await axios.get(
        `${serviceUrl}/api/v3/episode?seriesId=${mediaInfo.id}`,
        {
          headers: { "X-Api-Key": apiKey },
        }
      );

      if (mediaInfo.status.toLowerCase() === "ended") {
        // Delete the entire series if it has ended
        log.info(
          `${colors.red}Deleting${colors.reset} the entire series: ${mediaInfo.title} (ended)`
        );
        if (process.env.DRY_RUN !== "true") {
          await axios
            .delete(
              `${serviceUrl}/api/v3/series/${mediaInfo.id}?deleteFiles=true`,
              {
                headers: { "X-Api-Key": apiKey },
              }
            )
            .then(() => {
              log.success(`Series ${mediaInfo.title} deleted, files removed.`);
                `Série ${mediaInfo.title} supprimée, fichiers supprimés.`
              );
            });
        }
      } else {
        // Delete only the watched seasons
        for (const season of media.seasons) {
          const episodesInSeason = episodes.data.filter(
            (e) => e.seasonNumber === season.number && e.hasFile
          );

          const watchedEpisodes = new Set(
            season.episodes.map((ep) => ep.number)
          );

          if (episodesInSeason.length === watchedEpisodes.size) {
            log.info(
              `${colors.red}Deleting${colors.reset} entire season: ${mediaInfo.title} - Season ${season.number}`
            );
            for (const episode of episodesInSeason) {
              if (process.env.DRY_RUN !== "true") {
                await axios
                  .delete(
                    `${serviceUrl}/api/v3/episodeFile/${episode.episodeFileId}`,
                    {
                      headers: { "X-Api-Key": apiKey },
                    }
                  )
                  .then(() => {
                    log.success(`Episode ${episode.title} deleted.`);
                  })
                  .catch((error) => {
                    log.error(
                      `Error deleting episode ${episode.title} (#FileId: ${episode.episodeFileId}): ${error.message}`
                    );
                  });
              }
            }
          }
        }
      }
    } else {
      log.info(`Deleting the movie: ${mediaInfo.title}`);
      if (process.env.DRY_RUN !== "true") {
        await axios
          .delete(
            `${serviceUrl}/api/v3/movie/${mediaInfo.id}?deleteFiles=true`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          )
          .then(() => {
            log.success(`Movie ${mediaInfo.title} deleted.`);
          })
          .catch((error) => {
            log.error(
              `Error deleting the movie ${mediaInfo.title}: ${error.message}`
            );
          });
      }
    }
  } catch (error) {
    log.error(`Error deleting media ${mediaInfo.title}: ${error.message}`);
      `Erreur lors de la suppression du média ${mediaInfo.title} : ${error.message}`
    );
  }
}

// Updates the monitoring for the series to include future episodes
async function updateSeriesMonitoring(serviceUrl, apiKey, tvdbId) {
  const series = await axios.get(
    `${serviceUrl}/api/v3/series/lookup?term=tvdb:${tvdbId}`,
    {
      headers: { "X-Api-Key": apiKey },
    }
  );

  if (!series.data[0]?.id) {
    log.error(
      `Unable to update monitoring for the series ${series.data[0].title} with TVDB ID ${tvdbId}.`
    );
    return;
  }

  const updateUrl = `${serviceUrl}/api/v3/seasonpass`;
  const response = await axios.post(
    updateUrl,
    {
      series: [{ id: series.data[0].id }],
      monitoringOptions: { monitor: "future" },
    },
    {
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  log.info(
    `Monitoring updated for series ${series.data[0].title} with ID ${series.data[0].id} to include future episodes.`
  );
  return response.data;
}

// Checks and deletes media not tagged as "temp"
async function cleanMedia() {
  const watchedItems = await getWatchedItems();

  for (const item of watchedItems) {
    const isSeries = !!item.show;
    const title = isSeries ? item.show.title : item.movie.title;
    const id = isSeries ? item.show.ids.tvdb : item.movie.ids.tmdb;
    const mediaType = isSeries ? "series" : "movie";
    const serviceUrl = isSeries
      ? process.env.SONARR_URL
      : process.env.RADARR_URL;
    const apiKey = isSeries
      ? process.env.SONARR_API_KEY
      : process.env.RADARR_API_KEY;

    const isTemp = await isTempTagged(serviceUrl, apiKey, id, mediaType, title);
    try {
      if (isTemp) {
        if (isSeries) {
          const seriesInfo = await axios.get(
            `${serviceUrl}/api/v3/series/lookup?term=tvdb:${id}`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          );

          const episodes = await axios.get(
            `${serviceUrl}/api/v3/episode?seriesId=${seriesInfo.data[0].id}`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          );

          for (const season of item.seasons) {
            const episodesInSeason = episodes.data.filter(
              (e) => e.seasonNumber === season.number && e.hasFile
            );

            const watchedEpisodes = new Set(
              season.episodes.map((ep) => ep.number)
            );

            if (episodesInSeason.length === watchedEpisodes.size) {
              // Deleting watched episodes
              await deleteFromService(
                serviceUrl,
                apiKey,
                "series",
                seriesInfo.data[0],
                item
              );
              // Updating series monitoring for future episodes

              if (process.env.DRY_RUN !== "true") {
                await updateSeriesMonitoring(serviceUrl, apiKey, id);
              }
            }
          }
        } else {
          log.info(`${colors.red}Deleting${colors.reset} the movie: ${title}`);
            `${colors.red}Suppression${colors.reset} du film : ${title}`
          );

          const movieInfo = await axios.get(
            `${serviceUrl}/api/v3/movie?tmdbId=${id}`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          );

          // Deleting watched movies
          await deleteFromService(
            serviceUrl,
            apiKey,
            "movie",
            movieInfo.data[0]
          );
        }
      }
    } catch (error) {
      log.error(`Error deleting ${title}: ${error.message}`);
    }
  }
}

// Main function
async function main() {
  try {
    if (process.env.DRY_RUN !== "true") {
      log.warning("Dry-run mode disabled, media deletion enabled.");
    } else {
      log.warning("Dry-run mode enabled, media deletion disabled.");
    }
    await cleanMedia();
    log.info("Media cleaning completed, resuming scheduling tomorrow.");
      "Nettoyage des médias terminé, reprise de la planification dès demain."
    );
  } catch (error) {
    log.error(`Error in main execution: ${error.message}`);
  }
}

// Exécute le script
main();
