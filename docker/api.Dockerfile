FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @sketchcatch/api build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
EXPOSE 4000
CMD ["node", "dist/server.cjs"]
