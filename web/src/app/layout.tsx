import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { ApiStatus } from "@/components/api-status";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NAV Terminal — AMFI mutual fund NAV, AUM and flows",
  description:
    "Look up any Indian mutual fund's NAV, AUM and net flows, sourced from AMFI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <ApiStatus />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
