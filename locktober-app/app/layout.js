import "./globals.css";

export const metadata = {
  title: "Locktober",
  description: "Group goal check-ins for the crew",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
