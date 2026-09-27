export type LayoutType = "STRIP_3" | "STRIP_4" | "GRID_4" | "SINGLE";

export type Rect = { x: number; y: number; w: number; h: number };

export type LayoutPreset = {
  type: LayoutType;
  label: string;
  blurb: string;
  shotCount: number;
  canvas: { w: number; h: number };
  slots: Rect[];
};

const PAD = 48;
const GAP = 24;

function verticalStrip(
  type: LayoutType,
  label: string,
  blurb: string,
  shotCount: number,
  canvas: { w: number; h: number },
): LayoutPreset {
  const slotW = canvas.w - PAD * 2;
  const slotH = (canvas.h - PAD * 2 - GAP * (shotCount - 1)) / shotCount;
  const slots: Rect[] = Array.from({ length: shotCount }, (_, i) => ({
    x: PAD,
    y: PAD + i * (slotH + GAP),
    w: slotW,
    h: slotH,
  }));
  return { type, label, blurb, shotCount, canvas, slots };
}

export const LAYOUTS: Record<LayoutType, LayoutPreset> = {
  STRIP_3: verticalStrip("STRIP_3", "Strip 3", "Tiga bidikan vertikal", 3, {
    w: 900,
    h: 1800,
  }),
  STRIP_4: verticalStrip("STRIP_4", "Strip 4", "Empat bidikan vertikal", 4, {
    w: 900,
    h: 2400,
  }),
  GRID_4: {
    type: "GRID_4",
    label: "Grid 2x2",
    blurb: "Empat bidikan dalam kotak",
    shotCount: 4,
    canvas: { w: 1200, h: 1200 },
    slots: [
      { x: PAD, y: PAD, w: 540, h: 540 },
      { x: 612, y: PAD, w: 540, h: 540 },
      { x: PAD, y: 612, w: 540, h: 540 },
      { x: 612, y: 612, w: 540, h: 540 },
    ],
  },
  SINGLE: {
    type: "SINGLE",
    label: "Single",
    blurb: "Satu bidikan besar",
    shotCount: 1,
    canvas: { w: 1000, h: 1000 },
    slots: [{ x: PAD, y: PAD, w: 904, h: 904 }],
  },
};

export const LAYOUT_ORDER: LayoutType[] = [
  "STRIP_3",
  "STRIP_4",
  "GRID_4",
  "SINGLE",
];

export type FilterKey = keyof typeof FILTERS;

export const FILTERS = {
  original: { label: "Original", css: "none" },
  mono: { label: "Hitam Putih", css: "grayscale(1) contrast(1.08)" },
  warm: { label: "Warm", css: "sepia(0.35) saturate(1.2)" },
  cool: { label: "Cool", css: "saturate(1.05) hue-rotate(-8deg)" },
  retro: { label: "Retro", css: "sepia(0.5) contrast(0.95) saturate(1.3)" },
  punch: { label: "Punch", css: "contrast(1.2) saturate(1.25)" },
} as const satisfies Record<string, { label: string; css: string }>;

export const FILTER_ORDER = Object.keys(FILTERS) as FilterKey[];

export const STICKER_KEYS = ["snapvibe", "event", "today"] as const;
export type StickerKey = (typeof STICKER_KEYS)[number];

export const STICKER_TEXT: Record<StickerKey, string> = {
  snapvibe: "SNAPVIBE",
  event: "EVENT",
  today: "TODAY",
};

export function isLayoutType(value: unknown): value is LayoutType {
  return typeof value === "string" && value in LAYOUTS;
}

export function isFilterKey(value: unknown): value is FilterKey {
  return typeof value === "string" && value in FILTERS;
}
