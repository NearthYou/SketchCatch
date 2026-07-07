FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @sketchcatch/api build

FROM alpine:3.22 AS terraform
ARG TERRAFORM_VERSION=1.6.6
ARG TERRAFORM_ARCH=amd64
RUN apk add --no-cache ca-certificates curl unzip \
  && curl --fail --show-error --silent --location \
    "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TERRAFORM_ARCH}.zip" \
    --output /tmp/terraform.zip \
  && unzip /tmp/terraform.zip -d /usr/local/bin \
  && terraform -version

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=terraform /usr/local/bin/terraform /usr/local/bin/terraform
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
RUN terraform -version
EXPOSE 4000
CMD ["node", "dist/server.cjs"]
