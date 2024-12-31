FROM node:18

# Crée un répertoire de travail
WORKDIR /app

# Copie les fichiers package.json et package-lock.json
COPY package*.json ./

# Installe les dépendances
RUN npm install

# Copie le reste des fichiers
COPY . .

# Commande par défaut pour exécuter le script
CMD ["node", "script.js"]