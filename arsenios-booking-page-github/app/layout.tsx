import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arsenios' Booking Page",
  description: "Request an available one-hour drum lesson with Arsenios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
