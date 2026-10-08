"use client";

import { useState } from "react";

type FAQItem = { q: string; a: string };

export function Faq({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mt-10 grid items-start gap-4 md:grid-cols-2">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div
            key={item.q}
            className="cursor-pointer rounded-[var(--radius-lg)] border-2 border-ink bg-bg p-6 text-left transition-colors hover:bg-butter/25"
            style={{ boxShadow: "var(--lift-1)" }}
          >
            <span
              className="reg-cross mb-4 block size-5 text-ink/40"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="w-full cursor-pointer text-left"
            >
              <h3 className="font-display text-h3 font-extrabold">{item.q}</h3>
            </button>
            {isOpen && (
              <p className="mt-2 max-w-[var(--measure)] text-ink-body">
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
