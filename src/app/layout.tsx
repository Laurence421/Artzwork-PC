import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for big page titles (the "bold" look).
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const viewport: Viewport = { themeColor: "#070b24", colorScheme: "dark" };

export const metadata: Metadata = {
  // Full links for Facebook / Google previews (product photos, canonical URLs).
  metadataBase: new URL(process.env.SHOP_URL ?? "http://localhost:3000"),
  title: "Artzwork PC",
  description: "Computer parts and services.",
  // Default tab icon for both sites; the shop uses the icon set in Branding instead, when there is one.
  icons: { icon: "/brand/artzworkpc-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
