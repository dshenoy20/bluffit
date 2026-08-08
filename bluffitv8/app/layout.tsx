import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*) on notched phones
  themeColor: "#020617",
};

export const metadata: Metadata = {
  title: "BluffIt — Fool your friends",
  description:
    "A real-time multiplayer party game. Write believable fake answers, spot the real one, fool your friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
