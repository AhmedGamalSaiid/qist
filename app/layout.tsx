import type { Metadata } from "next";
import { JetBrains_Mono, Oxanium, Poppins } from "next/font/google";

import "../styles/index.css";

/* Self-hosted by next/font rather than fetched from the Google Fonts CDN at
   runtime — see styles/fonts.css for why. Each exposes the CSS variable that
   file binds Emotex's --font-display / --font-ui / --font-numeric to.

   Weights follow the design system: Oxanium is used at 200/300 only per its
   readme, plus 400/500 for the numeric lockups; Poppins ships static weights,
   so the three the system uses are declared explicitly. */
const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  variable: "--font-oxanium",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-poppins",
  display: "swap",
});

/* Qist's one phase addition to the type stack: --font-mono, for CodeToken,
   which renders OWNER_EMAIL for the reader to copy exactly. Weights 300 and
   400 per the sign-in handoff; logged in styles/fonts.css as a substitution. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qist",
  description: "A household's assets, liabilities and committed future payments.",
};

/* lang/dir are hard-coded to English until locale routing exists. Arabic is a
   constitutional requirement, not a later enhancement: when it lands, both
   attributes come from the active locale and the layout mirrors wholesale.
   Nothing here may assume `ltr`. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${oxanium.variable} ${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <body className="emx-root">{children}</body>
    </html>
  );
}
