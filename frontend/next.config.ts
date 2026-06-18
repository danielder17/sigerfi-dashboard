import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["maplibre-gl"],
  typescript: {
    ignoreBuildErrors: false,
  },
  // Vercel usa server-side rendering por defecto — no necesita output:'export'
  // Las rutas dinámicas /projects/[id] funcionan con server-rendering
};

export default nextConfig;
