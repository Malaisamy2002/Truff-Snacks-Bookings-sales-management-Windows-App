# Import the Windows app and give every bill a premium UPI "Scan & Pay" block

## Step 1 — Bring your app into this project

This project is currently empty. First I import the Windows version from your
upload so the whole app (turf bookings, snacks, dues, reports, settings, bills)
runs here again:

- Copy the app source, public files, build config, Tauri desktop folder and
  scripts across, skipping any git metadata and bundled type folders.
- Restore the extra packages the app needs (PDF, QR, spreadsheet, database,
  Tauri desktop bridge).
- Start the app and confirm the bills screen, settings and PDF preview work
  before touching any design.

## Step 2 — A shared, richer payment panel

Today the payment block is a plain grey box with a small QR and the UPI ID.
It gets rebuilt as one reusable "Scan & Pay" panel used by every format, in the
navy + gold style of your reference sheet:

- Navy header strip reading SCAN & PAY, gold hairline accent, rounded card.
- Larger, better-quiet-zoned QR with white padding so any phone locks on fast.
- The QR encodes a standard UPI link **without an amount**, so the payer types
  what they want to pay (works for advances, part payments and dues).
- Beside/below the QR: payee name, UPI ID, "Scan with any UPI app", and the
  bill number as reference.
- A row of small UPI app marks (Google Pay, PhonePe, Paytm, BHIM) plus the UPI
  wordmark, drawn as compact colour marks so they stay crisp at print size and
  need no internet.
- Paid/Balance state: a green PAID stamp when nothing is due, and a gold
  "BALANCE DUE" figure when something is pending.

## Step 3 — Per-format treatment

- **A4 invoice** — full-width panel: payment details on the left, framed QR
  card on the right, app marks under the QR, gold rule tying it into the
  totals block above.
- **A5 invoice** — same panel, compacted to a single row with a slightly
  smaller QR and one-line app strip.
- **80mm colour receipt** — centred navy-titled card, QR centred, UPI ID under
  it, colour app marks, gold divider.
- **80mm thermal (black & white)** — same layout, pure black-on-white: heavier
  QR modules, app names as small caps text instead of colour marks, so cheap
  thermal heads still print it legibly.
- **58mm POS slip** — condensed: centred QR sized to the narrow roll, UPI ID
  and a single "GPay | PhonePe | Paytm | BHIM" line.
- **Digital / mobile invoice** — on-screen card with a large tappable QR, a
  "Pay via UPI" button that opens the UPI link directly on the phone, plus
  copy-UPI-ID and share actions.

## Step 4 — Checks

- Regenerate each of the six formats with a sample bill and inspect the PDFs.
- Verify the QR actually decodes to a valid UPI link (decode it back in a
  test) for paid, part-paid and unpaid bills.
- Confirm nothing overlaps or spills off the page at each paper width and at
  the small/large font scale settings.
- Keep the existing tests green.

## Technical notes

- Import excludes `.git`, vendored `@types/*` and lockfile noise; deps are
  reinstalled from `package.json` (`jspdf`, `qrcode`, `dexie`, `exceljs`,
  `jszip`, `pdfjs-dist`, `jsqr`, `@tauri-apps/*`, `react-colorful`,
  `workbox-build`).
- Payment panel lives in a new helper in `src/lib/` and is called from
  `receipt-premium.ts` (`renderBoxed` and `renderCondensed`) plus the classic
  `receipt.ts` path, so there is a single source of truth.
- `upiUri()` drops the `am` parameter; it keeps `pa`, `pn`, `cu=INR` and `tn`
  (bill number). Error-correction level moves to `Q` for print resilience.
- App marks are drawn with jsPDF vector primitives (no bitmap assets, no
  network) and switch to text in the thermal/B&W mode.
