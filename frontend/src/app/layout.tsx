import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DMP AI API — OpenAI-Compatible AI for Developers",
  description:
    "Lightning-fast, OpenAI-compatible AI API. Use dmp1, dmp2, dmp3 models. Drop-in replacement — just change base_url.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <ClerkProvider>
        <body className={inter.variable}>{children}</body>
      </ClerkProvider>
    </html>
  );
}
