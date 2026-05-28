# Dockerfile pro Railway — bypassa o Railpack/Nixpacks (que estava falhando com
# "secret ID missing for '' environment variable" durante install apt packages).
# Quando há Dockerfile no repo, Railway constroi com Docker direto.
FROM node:18-slim

WORKDIR /app

# Instala dependências primeiro pra aproveitar cache de layer
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia o resto do server
COPY server/ ./server/

# Railway define $PORT dinamicamente; server.js já respeita process.env.PORT
EXPOSE 8080

CMD ["node", "server/server.js"]
