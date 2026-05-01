# Dockerfile

# ---- Base ----
FROM node:18-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/

# ---- Dependencies ----
FROM base AS dependencies
RUN npm install
RUN npx prisma generate

# ---- Build ----
FROM dependencies AS build
COPY . .
RUN npm run build

# ---- Release ----
FROM base AS release
COPY --from=build /usr/src/app/dist ./dist
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=dependencies /usr/src/app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main"]
