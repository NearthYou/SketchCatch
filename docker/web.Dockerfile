FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @sketchcatch/web...

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web/app ./apps/web/app
COPY apps/web/components ./apps/web/components
COPY apps/web/features ./apps/web/features
COPY apps/web/lib ./apps/web/lib
COPY apps/web/public ./apps/web/public
COPY apps/web/next-env.d.ts apps/web/next.config.mjs apps/web/tsconfig.json ./apps/web/
COPY packages/types/src ./packages/types/src
COPY packages/ui/src ./packages/ui/src
RUN pnpm --filter @sketchcatch/web build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node", "server.js"]
