import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import MainLayout from "@/components/MainLayout";
import GlobalJobTracker from "@/components/GlobalJobTracker";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "DNS Cleaner Pro | Centralized Management",
  description: "Clean and manage your DNS records across multiple providers with ease.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} font-sans antialiased`}>
        <Providers>
          <MainLayout>{children}</MainLayout>
          <GlobalJobTracker />
        </Providers>
      </body>
    </html>
  );
}
