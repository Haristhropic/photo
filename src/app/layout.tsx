import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";

import { SmoothScroll } from "@/components/smooth-scroll";

import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
    { media: "(prefers-color-scheme: light)", color: "#fdf3e3" },
    { media: "(prefers-color-scheme: dark)", color: "#181021" },
  ],
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem('snapvibe-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${baloo.variable} ${nunito.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="flex min-h-full flex-col antialiased">
        {/* THESIS: a guest's own phone is the booth. The category default is a
        marketing page for a laptop-shaped booth you install and staff; this
        refuses that by running a real capture countdown in the first viewport.
        OWN-WORLD: Indonesian cetak layar screenprint. Cream paper #FDF3E3, five
        translucent candy spot inks (pink #FF3D8B, tangerine #FF7A1A, butter
        #FFD23F, mint #3DD9A0, sky #3DA5F5) that mix into coral and plum where
        they overlap, off-register edges, hard offset sticker elevation, rounded
        everything. Baloo 2 display over Nunito text. No thin rules, no grey
        neutrals, no soft blur halos.
        STORY: the visitor is an organizer holding their phone at a wedding. They
        learn there is no hardware to buy, watch the strip assemble from their
        own camera, and copy one link to the group chat.
        FIRST VIEWPORT: live camera strip left at full bleed with the 3-second
        countdown running over it and a real frame dropping into the strip every
        3 seconds; headline and the single primary action stacked to its right;
        ink fields bleed off both edges behind both columns.
        FORM: spot-colour printshop, position 6 on the ranked grounded list,
        seed key 34f3c87c.
        FINISH: the run's exit condition, verbatim "unreviewed and undocumented
        is unfinished; this build ends with the finish review, the verdict,
        DESIGN.md, and every shipping raster carrying its provenance". */}
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
