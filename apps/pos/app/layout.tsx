import type { Metadata } from "next";
import { Geist_Mono, Roboto, Geist } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PharmaCare POS",
  description: "PharmaCare point of sale frontend",
};

import { PosProvider } from "@/components/pos-context";
import { QueryClientProvider } from "@/components/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "font-sans", geist.variable)}>
      <body className={`${geist.variable} ${geistMono.variable} h-full flex flex-col overflow-hidden`}>
        <QueryClientProvider>
          <PosProvider>
            <TooltipProvider>
              <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {children}
              </main>
            </TooltipProvider>
            <Footer />
            <Toaster position="top-center" />
          </PosProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
