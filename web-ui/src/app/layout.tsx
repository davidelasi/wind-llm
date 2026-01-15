import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wind Forecast - AGXC1 Los Angeles",
  description: "Real-time wind conditions and forecasting for ocean sports in Los Angeles area from NOAA station AGXC1",
  keywords: ["wind forecast", "sailing", "surfing", "kitesurfing", "Los Angeles", "AGXC1", "NOAA", "ocean sports"],
  authors: [{ name: "Wind Forecast App" }],
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  robots: "index, follow",
  openGraph: {
    title: "Wind Forecast - Los Angeles",
    description: "Real-time wind conditions from NOAA station AGXC1",
    type: "website",
  },
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
        {children}
      </body>
    </html>
  );
}
