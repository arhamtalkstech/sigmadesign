import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SigmaDesign",
  description:
    "Local-first design editor — .sig library, SQLite session, no cloud lock-in",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Design-file fonts commonly used in imported .fig/.sig documents */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Core design + chrome faces; document-specific fonts inject at runtime */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:ital,wght@0,100..900;1,100..900&family=Inter:ital,wght@0,100..900;1,100..900&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
