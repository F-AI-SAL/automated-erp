import type { ReactNode } from "react";

export const metadata = {
  title: "Food Engineering ERP",
  description: "Multi-tenant Restaurant ERP SaaS",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
