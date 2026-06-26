const apiProxyTarget = (
  process.env.API_PROXY_TARGET ??
  process.env.SKETCHCATCH_API_PROXY_ORIGIN ??
  "http://localhost:4000"
).replace(/\/+$/, "");

/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  transpilePackages: ["@sketchcatch/ui"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  }
};

export default nextConfig;
