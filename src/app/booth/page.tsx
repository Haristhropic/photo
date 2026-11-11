import type { Metadata } from "next";

import { BoothClient } from "@/components/booth-client";
import { LAYOUT_ORDER, type LayoutType } from "@/lib/layouts";

export const metadata: Metadata = {
  title: "Booth: StripSnap",
  description: "Pilih layout, jepret bareng-bareng, lalu simpan strip fotomu.",
};

export default async function BoothPage(props: PageProps<"/booth">) {
  const searchParams = await props.searchParams;
  const eventId =
    typeof searchParams.event === "string" ? searchParams.event : undefined;
  const from =
    typeof searchParams.from === "string" ? searchParams.from : undefined;
  const initialMode =
    searchParams.mode === "upload" ? "upload" : "camera";
  // The studio sends the guest back with the frame they chose. Without it the
  // upload editor would open on the widest frame, silently replacing their pick.
  const layoutParam =
    typeof searchParams.layout === "string" ? searchParams.layout : undefined;
  const initialLayout =
    layoutParam && LAYOUT_ORDER.includes(layoutParam as LayoutType)
      ? (layoutParam as LayoutType)
      : undefined;

  return (
    <BoothClient
      eventId={eventId}
      from={from}
      initialMode={initialMode}
      initialLayout={initialLayout}
    />
  );
}
