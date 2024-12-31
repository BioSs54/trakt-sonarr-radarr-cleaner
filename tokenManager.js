const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const TOKEN_FILE = "tokens.json"; // Fichier pour stocker les tokens

async function getAccessToken(code) {
  try {
    const response = await axios.post("https://api.trakt.tv/oauth/token", {
      code: code,
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      redirect_uri: process.env.TRAKT_REDIRECT_URI,
      grant_type: "authorization_code",
    });
    // Stocker les tokens
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(response.data, null, 2));
    console.log("Tokens enregistrés avec succès");
  } catch (error) {
    console.error("Erreur lors de l'obtention du token d'accès :", error);
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    const response = await axios.post("https://api.trakt.tv/oauth/token", {
      refresh_token: refreshToken,
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      redirect_uri: process.env.TRAKT_REDIRECT_URI,
      grant_type: "refresh_token",
    });

    // Stocker les tokens
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(response.data, null, 2));
    console.log("Tokens actualisés et enregistrés avec succès");
  } catch (error) {
    console.error("Erreur lors de l'actualisation du token d'accès :", error);
  }
}

// Fonction pour obtenir les tokens stockés
function getStoredTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      // Si le fichier n'existe pas, renvoie un message
      console.log(
        "Aucun fichier tokens.json trouvé, création d'un nouveau fichier."
      );
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({}, null, 2));
    }
    const data = fs.readFileSync(TOKEN_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Erreur lors de la lecture du fichier de tokens :", err);
    return null;
  }
}

module.exports = {
  getAccessToken,
  refreshAccessToken,
  getStoredTokens,
};
