import { LAYOUTS, type LayoutType } from "@/lib/layouts";

type LayoutPreviewProps = {
  type: LayoutType;
  slotFill?: string;
  markOpacity?: number;
  className?: string;
  decorative?: boolean;
};

/**
 * A true-scale miniature of a layout. Every slot sits where `renderStrip`
 * actually draws it, so the preview shows the real arrangement instead of a
 * row of equal boxes.
 */
export function LayoutPreview({
  type,
  slotFill = "var(--ink)",
  markOpacity = 0.45,
  className,
  decorative = false,
}: LayoutPreviewProps) {
  const layout = LAYOUTS[type];
  const ariaLabel = `Contoh susunan ${layout.label}: ${layout.blurb}, ${layout.shotCount} bidikan`;

  return (
    <svg
      viewBox={`0 0 ${layout.canvas.w} ${layout.canvas.h}`}
      data-layout-preview={type}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : ariaLabel}
    >
      <rect
        width={layout.canvas.w}
        height={layout.canvas.h}
        rx={layout.canvas.w * 0.02}
        fill="var(--bg)"
        stroke="var(--ink)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {layout.slots.map((slot, slotIndex) => {
        const cx = slot.x + slot.w / 2;
        const cy = slot.y + slot.h / 2;
        // The glyph is drawn in a 100-unit box, so scale it to sit inside the
        // slot with breathing room.
        const scale = (Math.min(slot.w, slot.h) * 0.62) / 100;
        return (
          <g key={slotIndex}>
            <rect
              x={slot.x}
              y={slot.y}
              width={slot.w}
              height={slot.h}
              rx={layout.canvas.w * 0.012}
              fill={slotFill}
              stroke="var(--ink)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <g
              transform={`translate(${cx} ${cy}) scale(${scale})`}
              fill="var(--ink)"
              opacity={markOpacity}
            >
              <circle cy="-20" r="20" />
              <path d="M -42 46a42 34 0 0 1 84 0z" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
