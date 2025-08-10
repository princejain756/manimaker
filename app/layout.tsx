import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "M - Maninfini AI Website Builder",
    template: "%s | Maninfini"
  },
  description: "Create stunning websites in seconds with M - the most powerful AI website builder. Generate beautiful, responsive websites with just a description.",
  keywords: ["AI website builder", "website generator", "Maninfini", "AI web design", "instant website", "responsive design"],
  authors: [{ name: "Maninfini" }],
  creator: "Maninfini",
  publisher: "Maninfini",
  metadataBase: new URL("https://ai.maninfini.com"),
  openGraph: {
    title: "M - Maninfini AI Website Builder",
    description: "Create stunning websites in seconds with AI-powered technology",
    url: "https://ai.maninfini.com",
    siteName: "Maninfini",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Maninfini AI Website Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "M - Maninfini AI Website Builder",
    description: "Create stunning websites in seconds with AI",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
