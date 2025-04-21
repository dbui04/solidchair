import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "react-hot-toast";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Solidchair - Airtable Clone",
  description: "A powerful Airtable clone built with Next.js, tRPC, and Prisma",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
