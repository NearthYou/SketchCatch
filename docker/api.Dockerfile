ARG TRIVY_VERSION=0.72.0

FROM node:24-alpine AS base
WORKDIR /repo
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
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

FROM alpine:3.22 AS trivy
ARG TRIVY_VERSION
ARG TRIVY_ARCH=64bit
RUN apk add --no-cache ca-certificates curl tar \
  && curl --fail --show-error --silent --location \
    "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz" \
    --output /tmp/trivy.tar.gz \
  && tar -xzf /tmp/trivy.tar.gz -C /tmp trivy \
  && install -m 0755 /tmp/trivy /usr/local/bin/trivy \
  && trivy --version

FROM node:24-alpine AS runner
ARG TRIVY_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV TRIVY_CACHE_DIR=/var/cache/sketchcatch/trivy
ENV TRIVY_SKIP_CHECK_UPDATE=true
ENV TRIVY_VERSION=${TRIVY_VERSION}
COPY --from=terraform /usr/local/bin/terraform /usr/local/bin/terraform
COPY --from=trivy /usr/local/bin/trivy /usr/local/bin/trivy
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
RUN terraform -version && trivy --version
EXPOSE 4000
# ECS RunTask overrides this command with: node dist/deployment-worker.cjs
CMD ["node", "dist/server.cjs"]
