import "./globals.css";

export const metadata = {
  title: "WinterArc",
  description: "Group goal check-ins for the crew",
  appleWebApp: {
    capable: true,
    title: "WinterArc",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#171712" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
