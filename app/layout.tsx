import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Fiesta Prototype — Free Multi-Model Chat",
  description:
    "Ask once, compare answers from free-tier AI models side by side.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
