import type { Metadata } from "next";
import { Geist_Mono, Roboto } from "next/font/google";

import { GlobalErrorBoundary } from "@/components/global-error-boundary";
import { QueryClientProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PharmaCare Admin",
  description: "Platform administration dashboard for PharmaCare SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} ${geistMono.variable}`}>
        <QueryClientProvider>
          <GlobalErrorBoundary>
            <TooltipProvider>{children}</TooltipProvider>
          </GlobalErrorBoundary>
        </QueryClientProvider>
      </body>
    </html>
  );
}
