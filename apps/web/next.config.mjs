/** @type {import("next").NextConfig} */
const apiProxyOrigin = process.env.SKETCHCATCH_API_PROXY_ORIGIN ?? "http://localhost:4000";

const nextConfig = {
  output: "standalone",
  transpilePackages: ["@sketchcatch/ui"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyOrigin}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
