import "./globals.css";

export const metadata = {
  title: "Guess the Year — Multiplayer Music Game",
  description: "Multiplayer game: guess the release year of songs",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
