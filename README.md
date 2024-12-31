# Trakt Sonarr/Radarr Cleaner


# ENGLISH

This project is a Node.js script that automatically cleans up movies and series from Sonarr and Radarr that are not part of your "keep list". The criterion for keeping a media is that it **must not be tagged** on Sonarr and Radarr. The script also connects to Trakt to retrieve the movies and series you have watched.

## Features

- Connects to the Trakt API to retrieve the movies and series you have watched.
- Automatically deletes movies and series tagged as "temp" on Radarr and Sonarr.
- Docker compatibility for easy execution in a container.

## Prerequisites

Before starting, make sure you have the following installed:

- [Docker](https://www.docker.com/)
- [Node.js](https://nodejs.org/) (used in the container)
- A [Trakt](https://trakt.tv/) account
- Sonarr and/or Radarr configured with API keys.

## Installation

1. Clone the repository:

2. Install the Node.js dependencies:

   ```bash
   npm install
   ```

3. Create a .env file at the root of the project to store environment variables:

   ```bash
   touch .env
   ```

4. Fill in the .env file with the following information:

   ```
   TRAKT_CLIENT_ID=your_trakt_client_id
   TRAKT_CLIENT_SECRET=your_trakt_client_secret
   SONARR_API_KEY=your_sonarr_api_key
   RADARR_API_KEY=your_radarr_api_key
   SONARR_URL=http://localhost:8989
   RADARR_URL=http://localhost:7878
   ```

   - **DEBUG**: Enable debug mode.
   - **DRY_RUN**: Run the script in "dry-run" mode: simulate deletion.
   - **TRAKT_CLIENT_ID**: Trakt API key (available in your Trakt account settings).
   - **TRAKT_CLIENT_SECRET**: OAuth access token for Trakt (generated after authentication).
   - **TRAKT_REDIRECT_URI**: Trakt redirect URL.
   - **SONARR_API_KEY**: Sonarr API key (available in Sonarr settings).
   - **RADARR_API_KEY**: Radarr API key (available in Radarr settings).
   - **SONARR_URL** and **RADARR_URL**: URLs to access your Sonarr and Radarr services.
   - **TEMP_TAG_ID_SONARR** and **TEMP_TAG_ID_RADARR**: Tag IDs to target the media.
   - **WATCHED_DAYS_THRESHOLD**: Number of days after watching that defines whether the media can be deleted.
   - **MAX_DAYS_THRESHOLD**: Number of days to consider in the Trakt watch history.

## Usage with Docker

1. Build the Docker image:

   ```bash
   docker build -t trakt-sonarr-radarr-cleaner .
   ```

2. Run the Docker container with the environment variables:

   ```bash
   docker run --env-file .env trakt-sonarr-radarr-cleaner
   ```

The script will connect to Trakt, retrieve the watched media, and then interact with Sonarr and Radarr to delete those tagged as "temp".

## Initial Token Creation

```bash
npm run get-token
```

If you want to do it manually:

1. Authorize the application:

   ```bash
   https://trakt.tv/oauth/authorize?client_id=...&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&response_type=code
   ```

2. Retrieve the token:
   ```bash
   curl -X POST https://api.trakt.tv/oauth/token -d '{
   "code": "XXXXXX",
   "client_id": "XXXXXXXXXXXXXX",
   "client_secret": "XXXXXXXXXXXX",
   "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
   "grant_type": "authorization_code"
   }' -H "Content-Type: application/json"
   ```

## How It Works

- The script connects to the Trakt API to retrieve the media you have watched.
- For each media (series or movie), it queries Sonarr or Radarr to get the details.
- If the media is tagged with the specified tag ID on Sonarr or Radarr, it is automatically deleted.

## Contributions

Contributions are welcome! Open an issue or submit a pull request to propose improvements or fixes.

## License

This project is licensed under the MIT License.

# FRANCAIS

Ce projet est un script Node.js qui permet de nettoyer automatiquement les films et séries de Sonarr et Radarr qui ne font pas partie de ta "liste à garder". Le critère pour garder un média est qu'il **ne doit pas être tagué** sur Sonarr et Radarr. Le script se connecte également à Trakt pour récupérer les films et séries que tu as regardés.

## Fonctionnalités

- Connexion à l'API de Trakt pour récupérer les films et séries que tu as regardés.
- Suppression automatique des films et séries tagués comme "temp" sur Radarr et Sonarr.
- Compatibilité avec Docker pour une exécution facile dans un conteneur.

## Prérequis

Avant de commencer, assure-toi d'avoir les éléments suivants installés :

- [Docker](https://www.docker.com/)
- [Node.js](https://nodejs.org/) (utilisé dans le conteneur)
- Un compte [Trakt](https://trakt.tv/)
- Sonarr et/ou Radarr configurés avec des API clés.

## Installation

1. Clone le dépôt :

2. Installe les dépendances Node.js :

   ```bash
   npm install
   ```

3. Crée un fichier `.env` à la racine du projet pour stocker les variables d'environnement :

   ```bash
   touch .env
   ```

4. Remplis le fichier `.env` avec les informations suivantes :

   ```
   TRAKT_CLIENT_ID=ton_client_id_trakt
   TRAKT_CLIENT_SECRET=ton_client_secret_trakt
   SONARR_API_KEY=ton_api_key_sonarr
   RADARR_API_KEY=ton_api_key_radarr
   SONARR_URL=http://localhost:8989
   RADARR_URL=http://localhost:7878
   ```

   - **DEBUG** : Active le mode débug.
   - **DRY_RUN** : Lancement du script en mode "dry-run" : simulation de suppression.
   - **TRAKT_CLIENT_ID** : Clé API Trakt (disponible dans les paramètres de ton compte Trakt).
   - **TRAKT_CLIENT_SECRET** : Token d'accès OAuth pour Trakt (généré après authentification).
   - **TRAKT_REDIRECT_URI** : URL de redirection Trakt.
   - **SONARR_API_KEY** : Clé API de Sonarr (disponible dans les paramètres de Sonarr).
   - **RADARR_API_KEY** : Clé API de Radarr (disponible dans les paramètres de Radarr).
   - **SONARR_URL** et **RADARR_URL** : URL d'accès à tes services Sonarr et Radarr.
   - **TEMP_TAG_ID_SONARR** et **TEMP_TAG_ID_RADARR** : ID des tags pour cibler les médias.
   - **WATCHED_DAYS_THRESHOLD** : Nombre de jours après visionnage qui définit si le média peut ou non être supprimé
   - **MAX_DAYS_THRESHOLD** : Nombre de jours à prendre en compte dans l'historique de visionnage Trakt.

## Utilisation avec Docker

1. Construis l'image Docker :

   ```bash
   docker build -t trakt-sonarr-radarr-cleaner .
   ```

2. Exécute le conteneur Docker avec les variables d'environnement :

   ```bash
   docker run --env-file .env trakt-sonarr-radarr-cleaner
   ```

Le script va se connecter à Trakt, récupérer les médias regardés, puis interagir avec Sonarr et Radarr pour supprimer ceux qui sont tagués "temp".

## Création token initial

```bash
npm run get-token
```

Si tu veux le faire manuellement :

1. Autorisation de l'application :

   ```bash
   https://trakt.tv/oauth/authorize?client_id=...&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&response_type=code
   ```

1. Récupèration du token :
   ```bash
   curl -X POST https://api.trakt.tv/oauth/token -d '{
   "code": "XXXXXX",
   "client_id": "XXXXXXXXXXXXXX",
   "client_secret": "XXXXXXXXXXXX",
   "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
   "grant_type": "authorization_code"
   }' -H "Content-Type: application/json"
   ```

## Fonctionnement

- Le script se connecte à l'API Trakt pour récupérer les médias que tu as regardés.
- Pour chaque média (série ou film), il interroge Sonarr ou Radarr pour récupérer les détails.
- Si le média est tagué avec l'ID de tag indiqué sur Sonarr ou Radarr, il est automatiquement supprimé.

## Contributions

Les contributions sont les bienvenues ! Ouvre une issue ou soumets une pull request pour proposer des améliorations ou corrections.

## Licence

Ce projet est sous licence MIT.