import type { Metadata } from "next";

import { StudioClient } from "@/components/studio-client";

export const metadata: Metadata = {
  title: "Studio: SnapVibe",
  description: "Ganti filter, tambah stiker, lalu simpan strip fotomu.",
};

export default function StudioPage() {
  return <StudioClient />;
}
