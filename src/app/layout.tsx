import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Concert OS Regie",
  description: "Regie web temps reel pour ecrans Minecraft",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
