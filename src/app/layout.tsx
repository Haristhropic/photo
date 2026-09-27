import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SnapVibe: Web Photobooth untuk Event Kamu",
  description:
    "Bikin strip foto event langsung di browser. Pilih layout, jepret bareng-bareng, filter, frame, dan stiker. QR untuk download.",
  applicationName: "SnapVibe",
  openGraph: {
    title: "SnapVibe: Web Photobooth untuk Event Kamu",
    description:
      "Bikin strip foto event langsung di browser. Pilih layout, jepret, filter, frame, stiker, lalu QR untuk download.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0f" },
  ],
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem('snapvibe-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
