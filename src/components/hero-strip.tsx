import { LAYOUTS } from "@/lib/layouts";

const layout = LAYOUTS.STRIP_3;
const SLOT_INKS = ["var(--butter)", "var(--mint)", "var(--sky)"];

/**
 * A static proof of the first layout, not a capture surface. The landing page
 * should show the shape of the result without pretending to hold a live camera
 * or a real guest's photograph.
 */
export function HeroStrip() {
  return (
    <figure
      data-hero-strip="strip-3"
      className="relative mx-auto w-full max-w-[300px] sm:max-w-[320px] lg:max-w-[360px]"
    >
      <div className="relative -rotate-[1.2deg] rounded-[var(--radius-xl)] border-2 border-ink bg-plum p-2 shadow-lift-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-2.5 font-display text-label font-bold tracking-[0.14em] text-bg/80 uppercase sm:px-0 sm:pt-0 sm:pb-3">
          <span>SnapVibe</span>
          <span>Strip 3</span>
        </div>

        <div className="rounded-[var(--radius)] border-2 border-ink bg-bg-elev p-2 sm:p-3">
          <div
            className="relative mx-auto w-full max-w-[220px] sm:max-w-[240px] lg:max-w-[260px]"
            style={{ aspectRatio: `${layout.canvas.w} / ${layout.canvas.h}` }}
            role="img"
            aria-label="Contoh Strip 3: tiga bidikan vertikal bernomor 1, 2, dan 3."
          >
            {layout.slots.map((slot, i) => (
              <div
                key={i}
                data-hero-slot={i + 1}
                className="absolute overflow-hidden rounded-[8px] border-2 border-ink"
                style={{
                  left: `${(slot.x / layout.canvas.w) * 100}%`,
                  top: `${(slot.y / layout.canvas.h) * 100}%`,
                  width: `${(slot.w / layout.canvas.w) * 100}%`,
                  height: `${(slot.h / layout.canvas.h) * 100}%`,
                  background: SLOT_INKS[i],
                }}
              >
                <span className="absolute top-1.5 left-2 font-display text-[0.6rem] font-extrabold tracking-[0.1em] text-ink">
                  0{i + 1}
                </span>
                <svg
                  viewBox="0 0 100 100"
                  className="absolute inset-0 m-auto size-[52%] text-ink/60"
                  aria-hidden="true"
                >
                  <g
                    fill="currentColor"
                    transform={`rotate(${(i - 1) * 5} 50 55)`}
                  >
                    <circle cx="50" cy="35" r="16" />
                    <path d="M 17 88 a 33 26 0 0 1 66 0 z" />
                  </g>
                </svg>
                <span
                  className="reg-cross absolute right-2 bottom-2 size-2.5 text-ink/35"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-1 pt-2.5 pb-1 font-display text-label font-bold tracking-[0.14em] text-bg/80 uppercase sm:px-0 sm:pt-3 sm:pb-0">
          <span>Tiga bidikan</span>
          <span>Contoh susunan</span>
        </div>
      </div>

      <figcaption className="mt-5 text-center font-display text-small font-bold tracking-[0.12em] text-ink-meta uppercase">
        Hasilnya satu strip, tiga bidikan.
      </figcaption>
    </figure>
  );
}
