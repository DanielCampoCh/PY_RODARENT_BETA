/** @type {import('next').NextConfig} */
const nextConfig = {
  // La interfaz vive en /public (HTML + JS); Next.js sirve las páginas y la API segura.
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/admin", destination: "/admin.html" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
export default nextConfig;
