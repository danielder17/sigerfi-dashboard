import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ClientLayout } from "./client-layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SIGERFI Dashboard v2",
  description: "Panel de Control Inteligente para ODK Central",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/cesium@1.142/Build/Cesium/Widgets/widgets.css"
        />
      </head>
      <body className="min-h-full flex">
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
        {/* Token de Cesium Ion disponible globalmente */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__CESIUM_TOKEN__='" + process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN + "'",
          }}
        />
        {/* CesiumJS - cargado globalmente para que cualuqier componente lo use */}
        <script src="https://unpkg.com/cesium@1.142/Build/Cesium/Cesium.js" async />
      </body>
    </html>
  );
}
