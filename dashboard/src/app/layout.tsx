import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GeoLang Platform Dashboard",
  description: "Monitor and manage GeoLang infrastructure",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
