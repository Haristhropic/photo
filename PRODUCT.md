# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Event organizer (primary).** Signs in, creates an event, optionally sets an access
code and uploads themed frames, then shares one link. Non-technical: weddings,
birthdays, and office events. Today they reach the product through a
documentation-driven setup path; a self-serve signup does not exist yet.

**Event guest (primary, anonymous).** Opens a shared link on the phone already in
their hand, takes a photo strip, and gets it back instantly. They never install
anything, never queue for a shared kiosk, and never create an account.

**Adjacent, unconfirmed:** personal use outside an event, per the original PRD.

## Product Purpose

Let an event organizer run a photo booth with a single shared link, and let each
guest take their own photo strip on their own phone, leaving with it in seconds.

Success means the organizer creates an event and shares one link; the guest's
whole journey is camera permission, a countdown, and a download. No hardware, no
attendant, no waiting line.

## Positioning

**The guest's phone is the booth.** A conventional web photobooth assumes a
laptop or tablet is available at the venue, so the room, the queue, and often an
attendant are part of the product. SnapVibe inverts that: the organizer ships a
link, and every guest's own device becomes the camera. Nothing to install, no
hardware to buy, no line to wait in, and the organizer's only artifact is a URL.

This also means the photo never travels through anyone else's device, which is
what makes the zero-setup privacy stance honest rather than decorative.

## Operating Context

- An organizer creates an event, optionally sets an access code and retention
  window, optionally uploads themed frame PNGs, and shares `/e/<slug>`.
- A guest opens that link, grants camera permission, picks a layout, and is
  captured one photo at a time on a per-shot countdown.
- The guest adjusts filter and stickers in a studio, saves, and lands on a result
  page carrying a QR code and a direct download.
- The organizer later checks session counts, download counts, and expiry dates
  in the admin dashboard, and triggers retention cleanup.
- Camera access requires HTTPS or `localhost`. On a local network the organizer
  must expose the booth over HTTPS, which is a real deployment constraint for
  on-premise use.

## Capabilities and Constraints

Confirmed and working:

- Four photo layouts, each with its own per-shot capture count.
- Per-shot 3-second countdown with visible progress, cancellation, and shutter
  feedback. Cancelling mid-countdown must never capture.
- Live camera capture composited to canvas with filter and sticker overlays.
- Unguessable 20-character access key per session; the key is the only thing
  protecting a photo.
- Auto-deletion of photos and their files after an event-specific retention
  window.
- Admin CRUD for events (title, access code, retention) and themed frames,
  gated by an email/password session cookie.
- Event entry pages that are open or access-code protected.
- Indonesian and English are the intended product languages (see Brand
  Commitments).

Constraints and confirmed gaps:

- **No organizer signup exists.** There is no registration endpoint and no
  account creation path; the only admin account is created by the database seed
  script. This blocks the confirmed self-serve model.
- **No i18n layer exists.** All shipped copy, all code comments, and the document
  `lang` attribute are Indonesian. Confirmed as a product commitment, not yet
  implemented.
- **Frame PNGs are never composited.** Frames are stored and administered, but
  the canvas renderer does not draw them, so the admin's frame feature is
  currently invisible to guests.
- Photos are stored on local disk. Object storage is the intended production
  path and the provider is undecided.
- The public photo-upload endpoint is unauthenticated, unrated, and unverified.
  For an internet-facing self-serve product this is an abuse and cost vector.
- Guests are entirely anonymous; there is deliberately no guest identity.

## Brand Commitments

- **Name:** SnapVibe.
- **Languages:** Indonesian and English as peers from the start, not one with the
  other as a fallback. Indonesian is the language currently shipped and should
  remain complete.
- **Voice:** informal second person ("kamu"), direct and brief. Instructions are
  phrased as the app speaking alongside the guest, not as system instructions
  ("Aktifkan kamera", "Mengambil bidikan", "Boleh jepret lagi?").
- **Guests stay anonymous.** No guest account may be introduced without the
  guest asking for one.
- **Photos are temporary by default.** Deletion is the product's privacy story,
  not a settings-page footnote.

## Evidence on Hand

- `PRD.md` v1.0.0, status Draft/Planning. It states intent, not the shipped
  system, and is stale in ways that matter: it specifies MySQL, Prisma, shadcn/ui,
  and Framer Motion, while the implementation uses Neon Postgres, Drizzle,
  Tailwind v4, and Lenis with no shadcn. Treat it as the original brief.
- `README.md` is an accurate technical record of the current system.
- A working end-to-end system verified against a live Neon Postgres database,
  with automated browser suites covering the guest journey, capture timing and
  frame brightness, and link-graph navigation.
- **Absent, and therefore not to be fabricated:** no logo or wordmark asset, no
  app icon, no brand imagery, no testimonials, no customer logos, no real-event
  photography of actual strips, no pricing or packaging, and no usage analytics.
  `public/` contains only Create Next App boilerplate SVGs.

## Product Principles

1. **The guest's phone is the booth.** Never require a guest to install, sign
   up, or wait for a turn.
2. **One link is the whole organizer experience.** If running an event needs
   more than a single URL, the product has failed.
3. **Photos are temporary.** Deletion is the default promise, and the retention
   window belongs to the organizer, not to a support ticket.
4. **Collect nothing you don't need.** Guests are anonymous by design; this is a
   privacy property to protect, not a limitation to work around.
5. **Indonesian and English ship together.** A locale is supported or it does
   not exist; there is no second-class fallback language.

## Accessibility & Inclusion

- Camera access is a hard technical gate, so every failure path (insecure
  context, permission denied, no device, device busy) must explain itself in
  plain language rather than surfacing a browser error.
- Capture is time-pressured, so the countdown must be visible, cancellable, and
  must never fire a capture the guest did not complete.
- Shutter and countdown feedback must not rely on colour alone.
- Guests having no account removes any authentication barrier from the primary
  audience.
- No accessibility conformance target (for example a WCAG level) has been
  confirmed and is currently undecided.
