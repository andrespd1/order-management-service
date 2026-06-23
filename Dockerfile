# Multi-stage build. The build stage carries the dev toolchain (TypeScript, Prisma CLI)
# to compile and generate the client; the runtime stage installs prod deps only and copies
# just the compiled output — so the final image ships no compiler, tsx, or source.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Apply pending migrations (non-interactive), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
