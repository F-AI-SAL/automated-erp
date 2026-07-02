import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Food Engineering — হিসাব",
  description: "Restaurant business dashboard — daily closing, P&L, expenses",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
