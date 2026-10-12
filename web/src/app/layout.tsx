import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const monoFigures = JetBrains_Mono({
  variable: "--font-mono-figures",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NAV Terminal — Indian mutual fund NAV, AUM and flows",
  description:
    "Look up any Indian mutual fund's NAV, AUM and net flows, sourced from AMFI.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${monoFigures.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
