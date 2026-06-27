import { warmTerraformPluginCache as defaultWarmTerraformPluginCache } from "./deployments/terraform-plugin-cache-warmup.js";
import type { TerraformRunResult } from "./deployments/terraform-runner.js";

type StartupLogger = {
  info: (messageOrObject: unknown, message?: string) => void;
  warn: (messageOrObject: unknown, message?: string) => void;
};

export type StartupApp = {
  listen: (options: { host: string; port: number }) => Promise<unknown>;
  log: StartupLogger;
};

export type StartApiServerOptions = {
  app: StartupApp;
  host: string;
  port: number;
  warmTerraformPluginCache?: () => Promise<TerraformRunResult>;
};

export async function startApiServer(options: StartApiServerOptions): Promise<void> {
  const warmTerraformPluginCache =
    options.warmTerraformPluginCache ?? defaultWarmTerraformPluginCache;

  await warmTerraformCacheBeforeListen(options.app, warmTerraformPluginCache);
  await options.app.listen({ host: options.host, port: options.port });
  options.app.log.info(`SketchCatch API listening on ${options.host}:${options.port}`);
}

async function warmTerraformCacheBeforeListen(
  app: StartupApp,
  warmTerraformPluginCache: () => Promise<TerraformRunResult>
): Promise<void> {
  try {
    const result = await warmTerraformPluginCache();

    if (result.exitCode === 0) {
      app.log.info("Terraform plugin cache warm-up completed");
      return;
    }

    app.log.warn(
      {
        exitCode: result.exitCode,
        timedOut: result.timedOut
      },
      "Terraform plugin cache warm-up failed; continuing API startup"
    );
  } catch (error) {
    app.log.warn({ error }, "Terraform plugin cache warm-up failed; continuing API startup");
  }
}
