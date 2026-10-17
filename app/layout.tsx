import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeGen Builder",
  description: "Describe an app, get working code and a live preview.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
