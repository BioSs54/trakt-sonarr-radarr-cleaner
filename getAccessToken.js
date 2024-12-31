require("dotenv").config();
const readline = require("readline");
const { getAccessToken } = require("./tokenManager");

// Crée une interface readline pour lire l'entrée de l'utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// URL pour obtenir le code d'autorisation
const authorizationUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${process.env.TRAKT_CLIENT_ID}&redirect_uri=${process.env.TRAKT_REDIRECT_URI}`;

console.log(
  `Veuillez obtenir un code d'autorisation en visitant l'URL suivante :\n${authorizationUrl}`
);

// Demande à l'utilisateur de saisir le code d'autorisation
rl.question("Veuillez entrer le code d'autorisation : ", async (code) => {
  try {
    // Appelle la fonction getAccessToken avec le code d'autorisation
    const tokens = await getAccessToken(code);
  } catch (error) {
    console.error("Erreur lors de l'obtention des tokens :", error.message);
  } finally {
    // Ferme l'interface readline
    rl.close();
  }
});
