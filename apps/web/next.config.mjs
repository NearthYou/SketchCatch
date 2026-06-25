const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://localhost:4000").replace(
  /\/+$/,
  ""
);

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@sketchcatch/ui"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  }
};

export default nextConfig;
