import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * The single "Scan & Pay" payment panel shared by every bill format —
 * A4/A5 invoices, the 80mm roll (colour and thermal B&W) and the 58/50mm POS
 * slip all draw it from here, so the QR payload, the quiet zone, the wording
 * and the UPI app strip can never drift apart between formats.
 *
 * The QR is a *static* UPI QR (no `am` parameter): the payer types the amount
 * themselves, which is what turf advances, part payments and running dues
 * need. Payload follows the NPCI deep-link format (`pa`/`pn`/`cu`/`tn`) that
 * GPay, PhonePe, Paytm and BHIM all accept.
 */

export const UPI_APPS = [
  { id: "gpay", name: "GPay", color: [66, 133, 244] as RGB },
  { id: "phonepe", name: "PhonePe", color: [95, 37, 159] as RGB },
  { id: "paytm", name: "Paytm", color: [0, 150, 214] as RGB },
  { id: "bhim", name: "BHIM", color: [242, 101, 34] as RGB },
] as const;

export type UpiAppId = (typeof UPI_APPS)[number]["id"];
export const UPI_APP_IDS: UpiAppId[] = UPI_APPS.map((a) => a.id);

/** Shown on a receipt when the shop hasn't picked a custom set — the two
 * apps almost every customer in India already has installed. */
export const DEFAULT_UPI_APPS: UpiAppId[] = ["gpay", "phonepe"];

/** Resolves saved app ids to their chip definitions, preserving the order
 * the shop picked and silently dropping anything unrecognised. Falls back
 * to the default pair when the resulting list would otherwise be empty
 * (nothing selected, or a corrupted/blank setting). */
function resolveApps(ids: UpiAppId[] | undefined): (typeof UPI_APPS)[number][] {
  const wanted = ids && ids.length ? ids : DEFAULT_UPI_APPS;
  const resolved = wanted
    .map((id) => UPI_APPS.find((a) => a.id === id))
    .filter((a): a is (typeof UPI_APPS)[number] => !!a);
  return resolved.length ? resolved : UPI_APPS.filter((a) => DEFAULT_UPI_APPS.includes(a.id));
}

export type RGB = [number, number, number];

/** Static UPI deep link — deliberately amount-less (see file header). `tn`
 * is capped at the 50-character note limit UPI apps enforce. */
export function upiUri(opts: { upiId: string; payeeName?: string; note?: string }): string {
  const params = new URLSearchParams();
  params.set("pa", opts.upiId.trim());
  if (opts.payeeName?.trim()) params.set("pn", opts.payeeName.trim().slice(0, 50));
  params.set("cu", "INR");
  if (opts.note?.trim()) params.set("tn", opts.note.trim().slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

/** Dark/light module grid, built synchronously so the QR can be drawn as
 * plain jsPDF rects (vector, crisp at any size) instead of a rasterised PNG.
 * Level Q survives a folded, smudged or thermal-faded print far better than
 * the level M this used to use. */
export function qrGrid(text: string): boolean[][] | null {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
    const size = qr.modules.size;
    const grid: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) row.push(!!qr.modules.get(r, c));
      grid.push(row);
    }
    return grid;
  } catch {
    return null;
  }
}

/**
 * Draws a QR inside a white tile of exactly `sizeMm`, keeping the 4-module
 * quiet zone the spec requires — scanners lose lock without it, which is the
 * usual reason a printed bill's QR "doesn't work".
 */
export function drawQr(
  pdf: jsPDF,
  x: number,
  y: number,
  sizeMm: number,
  text: string,
  dark: RGB = [0, 0, 0],
) {
  const grid = qrGrid(text);
  if (!grid) return;
  const n = grid.length;
  const quiet = 4;
  const mod = sizeMm / (n + quiet * 2);
  const originX = x + mod * quiet;
  const originY = y + mod * quiet;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, sizeMm, sizeMm, "F");
  pdf.setFillColor(...dark);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // +0.02mm bleed closes the hairline seams jsPDF leaves between
      // adjacent fills at small module sizes.
      if (grid[r]?.[c]) pdf.rect(originX + c * mod, originY + r * mod, mod + 0.02, mod + 0.02, "F");
    }
  }
}

/** Little tri-colour "UPI" wordmark. Vector text, no bitmap asset, so it
 * stays sharp and works fully offline. */
function drawUpiMark(pdf: jsPDF, x: number, y: number, fontSize: number, mono: boolean) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  const letters: { ch: string; color: RGB }[] = [
    { ch: "U", color: mono ? [40, 40, 40] : [255, 115, 2] },
    { ch: "P", color: mono ? [40, 40, 40] : [0, 140, 68] },
    { ch: "I", color: mono ? [40, 40, 40] : [20, 20, 20] },
  ];
  let cx = x;
  for (const l of letters) {
    pdf.setTextColor(...l.color);
    pdf.text(l.ch, cx, y);
    cx += pdf.getTextWidth(l.ch) + 0.2;
  }
  return cx - x;
}

function appStripWidth(
  pdf: jsPDF,
  apps: (typeof UPI_APPS)[number][],
  fontSize: number,
  padX: number,
  gap: number,
) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  return apps.reduce((w, a) => w + pdf.getTextWidth(a.name) + padX * 2 + gap, -gap);
}

/**
 * Row of small UPI-app chips (e.g. "GPay / PhonePe"), limited to whichever
 * apps the shop picked in Settings (default GPay + PhonePe). Colour fills on
 * paper that can print colour; on thermal black & white they become outlined
 * chips so they stay legible on a monochrome head.
 */
function drawAppStrip(
  pdf: jsPDF,
  apps: (typeof UPI_APPS)[number][],
  centerX: number,
  y: number,
  fontSize: number,
  mono: boolean,
): number {
  const padX = 1.2;
  const gap = 1.2;
  const h = fontSize * 0.5;
  const total = appStripWidth(pdf, apps, fontSize, padX, gap);
  let x = centerX - total / 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  for (const app of apps) {
    const w = pdf.getTextWidth(app.name) + padX * 2;
    if (mono) {
      pdf.setDrawColor(70, 70, 70);
      pdf.setLineWidth(0.15);
      pdf.roundedRect(x, y, w, h, 0.6, 0.6, "D");
      pdf.setTextColor(40, 40, 40);
    } else {
      pdf.setFillColor(...app.color);
      pdf.roundedRect(x, y, w, h, 0.6, 0.6, "F");
      pdf.setTextColor(255, 255, 255);
    }
    pdf.text(app.name, x + w / 2, y + h * 0.72, { align: "center" });
    x += w + gap;
  }
  return h;
}

export type UpiPanelOpts = {
  x: number;
  y: number;
  width: number;
  upiId: string;
  payeeName: string;
  /** Bill number, printed as the payment reference and put in the QR note. */
  reference: string;
  /** Pre-formatted balance, e.g. "₹ 2,520.00". Null/absent = nothing due. */
  balanceText?: string | null;
  /** PAID / UNPAID / PARTIAL, straight off the bill's totals. */
  status?: string;
  scale: number;
  /** wide = A4/A5 two-column card, roll = 80mm centred card,
   *  slim = 58/50mm dashed POS block. */
  variant: "wide" | "roll" | "slim";
  /** Thermal black-and-white output: no colour fills anywhere. */
  mono?: boolean;
  /** Which UPI app chips to show, in order. Defaults to GPay + PhonePe. */
  apps?: UpiAppId[];
  navy: RGB;
  gold: RGB;
  fill: RGB;
  green: RGB;
  /** A4 gets a bigger QR than A5; roll/slim size themselves. */
  qrSize?: number | undefined;
};

/**
 * The wide/roll panel's sizing math, in one place. `estimateUpiPanelHeight`
 * (a dry-run size check for the A4/A5 QR-shrink loop) and `drawUpiPanel`
 * (the real draw) used to each keep their own copy of this formula with a
 * "keep in sync" comment holding them together by hand — the kind of thing
 * that quietly drifts the next time either one changes. Both now call this
 * instead, so there is exactly one formula to get right. jsPDF has no
 * dry-run/measure-only mode, which is why this only computes numbers and
 * never touches `pdf`. */
function panelMetrics(o: {
  scale: number;
  variant: "wide" | "roll";
  qrSize?: number | undefined;
  hasBalance: boolean;
  paid: boolean;
}) {
  const wide = o.variant === "wide";
  const scale = o.scale || 1;
  const qrSize = o.qrSize ?? (wide ? 30 : 26);
  const pad = wide ? 4 : 3;
  const headerH = (wide ? 6.5 : 5.5) * scale;
  const titleFont = (wide ? 8.5 : 7) * scale;
  const bodyFont = (wide ? 8 : 6.5) * scale;
  const smallFont = (wide ? 6.8 : 5.8) * scale;
  const chipFont = (wide ? 5.6 : 5) * scale;
  const qrBlockH = qrSize + 2 + chipFont * 0.5 + 1.5 + smallFont * 0.5;
  const detailRows = 3 + (o.hasBalance || o.paid ? 1 : 0);
  const detailsH = detailRows * bodyFont * 0.62 + 2;
  const bodyH = wide ? Math.max(qrBlockH, detailsH) : qrBlockH + detailsH + 2;
  const panelH = headerH + pad + bodyH + pad;
  return { wide, qrSize, pad, headerH, titleFont, bodyFont, smallFont, chipFont, panelH };
}

/** Mirrors the wide/roll height formula in drawUpiPanel below without
 * drawing anything, so a caller on a fixed-height sheet (A4/A5) can check
 * whether the panel fits in the room left above the footer *before*
 * drawing it, and shrink qrSize if it doesn't. */
export function estimateUpiPanelHeight(o: {
  width: number;
  scale: number;
  variant: "wide" | "roll";
  qrSize?: number | undefined;
  hasBalance: boolean;
  paid: boolean;
}): number {
  return panelMetrics(o).panelH;
}

/** Draws the panel at (x, y) and returns the height consumed, so callers can
 * simply advance their own cursor by the return value. */
export function drawUpiPanel(pdf: jsPDF, o: UpiPanelOpts): number {
  const upiId = o.upiId.trim();
  if (!upiId) return 0;
  const mono = !!o.mono;
  const scale = o.scale || 1;
  const uri = upiUri({
    upiId,
    payeeName: o.payeeName,
    note: o.reference ? `Bill ${o.reference}` : "",
  });
  const paid = (o.status || "").toUpperCase() === "PAID";
  const dark: RGB = mono ? [0, 0, 0] : [10, 10, 10];
  const apps = resolveApps(o.apps);

  if (o.variant === "slim") return drawSlim(pdf, o, uri, upiId, scale, apps);

  const wide = o.variant === "wide";
  const { qrSize, pad, headerH, titleFont, bodyFont, smallFont, chipFont, panelH } = panelMetrics({
    scale,
    variant: o.variant,
    qrSize: o.qrSize,
    hasBalance: !!o.balanceText,
    paid,
  });

  // Card + navy header strip with the gold hairline.
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(mono ? 120 : 190, mono ? 120 : 195, mono ? 120 : 205);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(o.x, o.y, o.width, panelH, 2, 2, "FD");
  pdf.setFillColor(...o.navy);
  pdf.rect(o.x + 0.6, o.y + 0.6, o.width - 1.2, headerH, "F");
  if (!mono) {
    pdf.setFillColor(...o.gold);
    pdf.rect(o.x + 0.6, o.y + 0.6 + headerH - 0.7, o.width - 1.2, 0.7, "F");
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(titleFont);
  pdf.setTextColor(255, 255, 255);
  pdf.text("SCAN & PAY", o.x + pad, o.y + headerH * 0.72);
  const markW = drawUpiMark(pdf, 0, -100, titleFont, mono); // measure off-page
  drawUpiMark(pdf, o.x + o.width - pad - markW, o.y + headerH * 0.72, titleFont, false);
  // Re-paint the wordmark in white when mono (the coloured pass above is
  // invisible on a monochrome header otherwise).
  if (mono) {
    pdf.setFillColor(...o.navy);
    pdf.rect(o.x + o.width - pad - markW - 0.6, o.y + 0.8, markW + 1.2, headerH - 1.2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(titleFont);
    pdf.text("UPI", o.x + o.width - pad, o.y + headerH * 0.72, { align: "right" });
  }

  const topY = o.y + headerH + pad;
  const qrX = wide ? o.x + o.width - pad - qrSize : o.x + (o.width - qrSize) / 2;
  const qrY = topY;

  // QR tile with a thin frame so it reads as a scan target.
  pdf.setDrawColor(mono ? 90 : 170, mono ? 90 : 175, mono ? 90 : 185);
  pdf.setLineWidth(0.25);
  pdf.rect(qrX - 0.8, qrY - 0.8, qrSize + 1.6, qrSize + 1.6, "D");
  drawQr(pdf, qrX, qrY, qrSize, uri, dark);

  let underY = qrY + qrSize + 2 + chipFont * 0.5;
  drawAppStrip(pdf, apps, qrX + qrSize / 2, qrY + qrSize + 2, chipFont, mono);
  underY += 1.5 + smallFont * 0.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(smallFont);
  pdf.setTextColor(110, 110, 110);
  pdf.text("Scan with any UPI app", qrX + qrSize / 2, underY - smallFont * 0.12, {
    align: "center",
  });

  // Details column: to the left of the QR on A4/A5, beneath it on the roll.
  const detX = o.x + pad;
  const detW = wide ? o.width - pad * 3 - qrSize : o.width - pad * 2;
  let dy = (wide ? topY : underY + 3) + bodyFont * 0.55;
  const line = (label: string, value: string, strong = false, color?: RGB) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(bodyFont * (strong ? 1.05 : 1));
    pdf.setTextColor(...(mono ? ([60, 60, 60] as RGB) : o.navy));
    pdf.text(label, detX, dy);
    const lw = pdf.getTextWidth(label);
    pdf.setFont("helvetica", strong ? "bold" : "normal");
    pdf.setTextColor(...(color ?? ([40, 40, 40] as RGB)));
    // Long values (a UPI ID like "shopname@okhdfcbank" is often wider than
    // the column) used to be passed to text() with a maxWidth option —
    // jsPDF then silently wraps them onto extra lines, but `dy` only ever
    // advanced by one line, so a wrapped 2nd line landed right on top of
    // the next label/value row. Measure the wrap ourselves so dy accounts
    // for however many lines the value actually took.
    const valueMaxW = Math.max(10, detW - lw - 2);
    const valueLines = pdf.splitTextToSize(`  ${value}`, valueMaxW) as string[];
    valueLines.forEach((vLine, vi) => {
      pdf.text(vLine, detX + lw, dy + vi * bodyFont * 0.62);
    });
    dy += bodyFont * 0.62 * valueLines.length;
  };
  line("Pay to", o.payeeName || upiId);
  line("UPI ID", upiId);
  if (o.reference) line("Ref", o.reference);
  if (paid) {
    const label = "PAID";
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(bodyFont);
    const w = pdf.getTextWidth(label) + 4;
    if (mono) {
      pdf.setDrawColor(40, 40, 40);
      pdf.roundedRect(detX, dy - bodyFont * 0.36, w, bodyFont * 0.52, 1, 1, "D");
      pdf.setTextColor(20, 20, 20);
    } else {
      pdf.setFillColor(...o.green);
      pdf.roundedRect(detX, dy - bodyFont * 0.36, w, bodyFont * 0.52, 1, 1, "F");
      pdf.setTextColor(255, 255, 255);
    }
    pdf.text(label, detX + w / 2, dy, { align: "center" });
  } else if (o.balanceText) {
    line("Balance due", o.balanceText, true, mono ? [20, 20, 20] : [150, 90, 10]);
  }

  return panelH;
}

/** 58/50mm POS slip: no card frame (thermal slips are dashed-rule affairs),
 * just a centred block that matches the rest of the condensed layout. */
function drawSlim(
  pdf: jsPDF,
  o: UpiPanelOpts,
  uri: string,
  upiId: string,
  scale: number,
  apps: (typeof UPI_APPS)[number][],
): number {
  const centerX = o.x + o.width / 2;
  const titleFont = 7 * scale;
  const smallFont = 5.6 * scale;
  const qrSize = Math.min(o.width - 6, 30);
  const paid = (o.status || "").toUpperCase() === "PAID";
  let y = o.y;

  pdf.setDrawColor(150, 150, 150);
  pdf.setLineDashPattern([1, 0.8], 0);
  pdf.line(o.x, y, o.x + o.width, y);
  pdf.setLineDashPattern([], 0);
  y += 4;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(titleFont);
  pdf.setTextColor(20, 20, 20);
  pdf.text("SCAN & PAY  ·  UPI", centerX, y, { align: "center" });
  y += 2;

  pdf.setDrawColor(90, 90, 90);
  pdf.setLineWidth(0.25);
  pdf.rect(centerX - qrSize / 2 - 0.8, y - 0.8, qrSize + 1.6, qrSize + 1.6, "D");
  drawQr(pdf, centerX - qrSize / 2, y, qrSize, uri, [0, 0, 0]);
  y += qrSize + 3;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(smallFont);
  pdf.setTextColor(20, 20, 20);
  pdf.text(upiId, centerX, y, { align: "center" });
  y += smallFont * 0.62;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(70, 70, 70);
  pdf.text(apps.map((a) => a.name).join(" | "), centerX, y, { align: "center" });
  y += smallFont * 0.62;

  // Paid / balance-due mark, same information the wide and roll variants
  // carry — a fully paid slip shouldn't still invite the customer to pay,
  // and a partial one should show what's left before it asks them to open
  // their UPI app.
  if (paid) {
    const label = "PAID";
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(smallFont);
    const w = pdf.getTextWidth(label) + 4;
    pdf.setDrawColor(40, 40, 40);
    pdf.setLineWidth(0.15);
    pdf.roundedRect(centerX - w / 2, y - smallFont * 0.36, w, smallFont * 0.52, 1, 1, "D");
    pdf.setTextColor(20, 20, 20);
    pdf.text(label, centerX, y, { align: "center" });
    y += smallFont * 0.62;
  } else {
    if (o.balanceText) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(150, 90, 10);
      pdf.text(`Balance due  ${o.balanceText}`, centerX, y, { align: "center" });
      y += smallFont * 0.62;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(70, 70, 70);
    pdf.text("Enter amount in your UPI app", centerX, y, { align: "center" });
    y += smallFont * 0.62;
  }
  y += 2;

  return y - o.y;
}
