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
            className="relative rounded-[var(--radius-lg)] border-2 border-ink bg-bg text-left transition-colors hover:bg-butter/25"
            style={{ boxShadow: "var(--lift-1)" }}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
              aria-labelledby={`faq-question-${index}`}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer"
            />
            <div className="p-5 sm:p-6">
              <span
                className={`reg-cross mb-3 block size-5 text-ink/40 transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
                aria-hidden="true"
              />
              <h3
                id={`faq-question-${index}`}
                className="font-display text-h3 font-extrabold"
              >
                {item.q}
              </h3>
              {isOpen && (
                <p
                  id={`faq-answer-${index}`}
                  className="mt-2 max-w-[var(--measure)] text-ink-body"
                >
                  {item.a}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
