import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["maplibre-gl", "react-map-gl"],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
