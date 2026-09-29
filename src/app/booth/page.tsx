import type { Metadata } from "next";

import { BoothClient } from "@/components/booth-client";

export const metadata: Metadata = {
  title: "Booth: SnapVibe",
  description: "Pilih layout, jepret bareng-bareng, lalu simpan strip fotomu.",
};

export default async function BoothPage(props: PageProps<"/booth">) {
  const searchParams = await props.searchParams;
  const eventId =
    typeof searchParams.event === "string" ? searchParams.event : undefined;
  const from =
    typeof searchParams.from === "string" ? searchParams.from : undefined;

  return <BoothClient eventId={eventId} from={from} />;
}
