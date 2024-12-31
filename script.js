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

// Vérification des variables d'environnement nécessaires
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
    console.error(`❌ Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
});

// Variables d'environnement
const DEBUG = process.env.DEBUG === "true";
const WATCHED_DAYS_THRESHOLD =
  parseInt(process.env.WATCHED_DAYS_THRESHOLD, 10) || 30;
const MAX_DAYS_THRESHOLD = parseInt(process.env.MAX_DAYS_THRESHOLD, 10) || 90;

// Couleurs pour les logs
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
};

// Fonctions de log
const log = {
  error: (message, ...args) =>
    console.error(
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
      `[${colors.green}✅ SUCCÈS${colors.reset}] ${message}`,
      ...args
    ),
  warning: (message, ...args) =>
    console.warn(
      `[${colors.yellow}⚠️ ATTENTION${colors.reset}] ${message}`,
      ...args
    ),
};

// Planification du rafraîchissement des tokens
cron.schedule("0 0 * * *", async () => {
  log.info("Lancement du cron pour rafraîchissement des tokens...");
  try {
    const tokens = getStoredTokens();
    if (tokens?.refresh_token) {
      await refreshAccessToken(tokens.refresh_token);
      log.success("Token d'accès rafraîchi avec succès.");
    } else {
      log.error("Token de rafraîchissement introuvable.");
    }
  } catch (error) {
    log.error(`Erreur lors du rafraîchissement des tokens : ${error.message}`);
  }
});

// Récupère les films et séries regardés depuis Trakt
async function getWatchedItems() {
  const tokens = getStoredTokens();
  if (!tokens?.access_token) {
    log.error(
      `Token d'accès introuvable. Veuillez obtenir un nouveau token en executant le script npm run start`
    );
    return [];
  }

  try {
    // Calcule la date de début en fonction du seuil WATCHED_DAYS_THRESHOLD
    const startDate = dayjs().subtract(MAX_DAYS_THRESHOLD, "day").toISOString();

    // Calcule la date de fin en fonction du seuil WATCHED_DAYS_THRESHOLD
    const endDate = dayjs()
      .subtract(WATCHED_DAYS_THRESHOLD, "day")
      .toISOString();

    // Récupérer les séries regardées
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

    // Récupérer les films regardés
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
    log.error(
      `Erreur lors de la récupération des éléments regardés : ${error.message}`
    );
    return [];
  }
}

// Vérifie si le média est tagué "temp" sur Sonarr/Radarr
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
      log.debug(`${title} ${colors.yellow}non trouvé${colors.reset}.`);
    } else if (data && data.length > 0 && !isTagged) {
      log.debug(
        `${title} n'est pas tagué "temp", ${colors.green}conservé${colors.reset}.`
      );
    }

    return isTagged;
  } catch (error) {
    log.debug(
      `Tag "temp" pour ${title} (#${mediaId}) introuvable : ${error.message}`
    );
    return false;
  }
}

// Supprime un média de Sonarr/Radarr avec options deleteFiles et addImportExclusion
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
        // Supprimer toute la série si elle est terminée
        log.info(
          `${colors.red}Suppression${colors.reset} de la série complète : ${mediaInfo.title} (terminée)`
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
              log.success(
                `Série ${mediaInfo.title} supprimée, fichiers supprimés.`
              );
            });
        }
      } else {
        // Supprimer uniquement les saisons regardées
        for (const season of media.seasons) {
          const episodesInSeason = episodes.data.filter(
            (e) => e.seasonNumber === season.number && e.hasFile
          );

          const watchedEpisodes = new Set(
            season.episodes.map((ep) => ep.number)
          );

          if (episodesInSeason.length === watchedEpisodes.size) {
            log.info(
              `${colors.red}Suppression${colors.reset} de la saison complète : ${mediaInfo.title} - Saison ${season.number}`
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
                    log.success(`Épisode ${episode.title} supprimé.`);
                  })
                  .catch((error) => {
                    log.error(
                      `Erreur lors de la suppression de l'épisode ${episode.title} (#FileId: ${episode.episodeFileId}) : ${error.message}`
                    );
                  });
              }
            }
          }
        }
      }
    } else {
      log.info(`Suppression du film : ${mediaInfo.title}`);
      if (process.env.DRY_RUN !== "true") {
        await axios
          .delete(
            `${serviceUrl}/api/v3/movie/${mediaInfo.id}?deleteFiles=true`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          )
          .then(() => {
            log.success(`Film ${mediaInfo.title} supprimé.`);
          })
          .catch((error) => {
            log.error(
              `Erreur lors de la suppression du film ${mediaInfo.title} : ${error.message}`
            );
          });
      }
    }
  } catch (error) {
    log.error(
      `Erreur lors de la suppression du média ${mediaInfo.title} : ${error.message}`
    );
  }
}

// Met à jour le monitoring de la série pour les futurs épisodes
async function updateSeriesMonitoring(serviceUrl, apiKey, tvdbId) {
  const series = await axios.get(
    `${serviceUrl}/api/v3/series/lookup?term=tvdb:${tvdbId}`,
    {
      headers: { "X-Api-Key": apiKey },
    }
  );

  if (!series.data[0]?.id) {
    log.error(
      `Impossible de mettre à jour le monitoring pour la série ${series.data[0].title} avec TVDB ID ${tvdbId}.`
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
    `Monitoring de la série ${series.data[0].title} avec ID ${series.data[0].id} mis à jour pour les futurs épisodes.`
  );
  return response.data;
}

// Vérifie et supprime les médias non tagués "temp"
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
              // Suppression des épisodes visionnés
              await deleteFromService(
                serviceUrl,
                apiKey,
                "series",
                seriesInfo.data[0],
                item
              );
              // Mise à jour du monitoring de la série pour les futurs épisodes

              if (process.env.DRY_RUN !== "true") {
                await updateSeriesMonitoring(serviceUrl, apiKey, id);
              }
            }
          }
        } else {
          log.info(
            `${colors.red}Suppression${colors.reset} du film : ${title}`
          );

          const movieInfo = await axios.get(
            `${serviceUrl}/api/v3/movie?tmdbId=${id}`,
            {
              headers: { "X-Api-Key": apiKey },
            }
          );

          // Suppression des films visionnés
          await deleteFromService(
            serviceUrl,
            apiKey,
            "movie",
            movieInfo.data[0]
          );
        }
      }
    } catch (error) {
      log.error(`Erreur lors de la suppression de ${title} : ${error.message}`);
    }
  }
}

// Fonction principale
async function main() {
  try {
    if (process.env.DRY_RUN !== "true") {
      log.warning("Mode dry-run désactivé, suppression des médias activée.");
    } else {
      log.warning("Mode dry-run activé, suppression des médias désactivée.");
    }
    await cleanMedia();
    log.info(
      "Nettoyage des médias terminé, reprise de la planification dès demain."
    );
  } catch (error) {
    log.error(`Erreur dans l'exécution principale : ${error.message}`);
  }
}

// Exécute le script
main();
