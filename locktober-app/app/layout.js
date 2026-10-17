import "./globals.css";

export const metadata = {
  title: "WinterArc",
  description: "Group goal check-ins for the crew",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
