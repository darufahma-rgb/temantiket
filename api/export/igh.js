'use strict';

import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// ── Coordinate constants ───────────────────────────────────────────────────
const TPL_W_PX = 740;
const PAGE_W   = 413.9506;
const PAGE_H   = 572.532;
const SCALE    = PAGE_W / TPL_W_PX;

const BRAND_BLUE = rgb(0x08 / 255, 0x8B / 255, 0xC1 / 255);
const GREY_MUTED = rgb(0.45, 0.45, 0.45);
const DARK       = rgb(0.13, 0.13, 0.13);
const WHITE      = rgb(1, 1, 1);
const WA_GREEN   = rgb(0x25 / 255, 0xD3 / 255, 0x66 / 255);

// ── Default layout config (from ighPdfConfig.ts) ──────────────────────────
const DEFAULT_IGH_LAYOUT = {
  projectName: { xPx: 55, topPx: 257, size: 22, lineGapPx: 4 },
  metaInfo: { customerXPx: 335, dateXPx: 538, topPx: 259, size: 13 },
  hotel: { makkahXPx: 51, madinahXPx: 407, topPx: 395, size: 22, subtitleOffsetPx: 38 },
  pricing: { paxXPx: 47, priceXPx: 272, topPx: 518, size: 22, yOffsetPdf: -8 },
  groupPricing: {
    topPx: 510, rowSpacingPx: 28,
    paxCenterXPx: 95, quadCenterXPx: 280, tripleCenterXPx: 465, doubleCenterXPx: 650,
    quadXOffsetPx: 0, tripleXOffsetPx: 0, doubleXOffsetPx: 0,
    cellHeightPx: 24, size: 14, currencySymbol: '$',
  },
  checklist: {
    leftXPx: 212, rightXPx: 576, firstBaselinePx: 715, rowSpacingPx: 28,
    yOffsetPx: 0, size: 10,
    sudahTermasukAlign: 'center', belumTermasukAlign: 'center', listBullet: '•',
  },
  fonts: { family: 'Poppins', overrides: {} },
  pdfCurrency: 'USD',
  footer: { topPx: 891, waXPx: 290, waIconSizePt: 9, size: 7, showWhatsapp: true },
  whatsappPosition: { xPx: 290, yPx: 891 },
  mainHeaderGap: 25,
  headerSubtitleOffset: { xPx: 0, yPx: 0 },
  subtitleWidthPx: 285,
  subtitleFontSize: 11,
  dateDisplayMode: 'Short',
  priceDisplayMode: 'compact',
};

const GROUP_LAYOUT = {
  projectName: { xPx: 55, topPx: 90, size: 26, lineGapPx: 4 },
  metaInfo: { customerXPx: 365, dateXPx: 55, topPx: 273, size: 12 },
  hotel: { makkahXPx: 55, madinahXPx: 384, topPx: 343, size: 22, subtitleOffsetPx: 38 },
  pricing: { paxXPx: 47, priceXPx: 272, topPx: 518, size: 22, yOffsetPdf: -8 },
  groupPricing: {
    topPx: 440, rowSpacingPx: 28,
    paxCenterXPx: 126, quadCenterXPx: 306, tripleCenterXPx: 476, doubleCenterXPx: 631,
    quadXOffsetPx: 0, tripleXOffsetPx: 0, doubleXOffsetPx: 0,
    cellHeightPx: 24, size: 14, currencySymbol: '$',
  },
  checklist: {
    leftXPx: 200, rightXPx: 542, firstBaselinePx: 775, rowSpacingPx: 26,
    yOffsetPx: 0, size: 10,
    sudahTermasukAlign: 'center', belumTermasukAlign: 'center', listBullet: '•',
  },
  fonts: { family: 'Poppins', overrides: {} },
  pdfCurrency: 'USD',
  footer: { topPx: 891, waXPx: 290, waIconSizePt: 9, size: 7, showWhatsapp: true },
  whatsappPosition: { xPx: 290, yPx: 891 },
  mainHeaderGap: 25,
  headerSubtitleOffset: { xPx: 0, yPx: 0 },
  subtitleWidthPx: 285,
  subtitleFontSize: 11,
  dateDisplayMode: 'Short',
  priceDisplayMode: 'compact',
};

function mergeConfig(base, override) {
  if (!override) return base;
  return {
    projectName: { ...base.projectName, ...(override.projectName ?? {}) },
    metaInfo: { ...base.metaInfo, ...(override.metaInfo ?? {}) },
    hotel: { ...base.hotel, ...(override.hotel ?? {}) },
    pricing: { ...base.pricing, ...(override.pricing ?? {}) },
    groupPricing: { ...base.groupPricing, ...(override.groupPricing ?? {}) },
    checklist: { ...base.checklist, ...(override.checklist ?? {}) },
    footer: { ...base.footer, ...(override.footer ?? {}) },
    fonts: { ...base.fonts, ...(override.fonts ?? {}), overrides: { ...(base.fonts.overrides ?? {}), ...(override.fonts?.overrides ?? {}) } },
    customTemplate: 'customTemplate' in (override ?? {}) ? (override.customTemplate ?? null) : (base.customTemplate ?? null),
    pdfCurrency: 'pdfCurrency' in (override ?? {}) ? (override.pdfCurrency ?? base.pdfCurrency ?? 'USD') : (base.pdfCurrency ?? 'USD'),
    mainHeaderGap: override.mainHeaderGap ?? base.mainHeaderGap ?? base.headerSubtitleGap,
    headerSubtitleGap: override.headerSubtitleGap ?? base.headerSubtitleGap,
    headerSubtitleOffset: override.headerSubtitleOffset ? { ...(base.headerSubtitleOffset ?? { xPx: 0, yPx: 0 }), ...override.headerSubtitleOffset } : base.headerSubtitleOffset,
    subtitleWidthPx: 'subtitleWidthPx' in (override ?? {}) ? (override.subtitleWidthPx ?? base.subtitleWidthPx ?? 285) : (base.subtitleWidthPx ?? 285),
    subtitleFontSize: 'subtitleFontSize' in (override ?? {}) ? (override.subtitleFontSize ?? base.subtitleFontSize ?? 11) : (base.subtitleFontSize ?? 11),
    dateDisplayMode: 'dateDisplayMode' in (override ?? {}) ? (override.dateDisplayMode ?? base.dateDisplayMode ?? 'Short') : (base.dateDisplayMode ?? 'Short'),
    whatsappPosition: override.whatsappPosition ? { ...(base.whatsappPosition ?? { xPx: 0, yPx: 0 }), ...override.whatsappPosition } : base.whatsappPosition,
    priceDisplayMode: 'priceDisplayMode' in (override ?? {}) ? (override.priceDisplayMode ?? base.priceDisplayMode ?? 'compact') : (base.priceDisplayMode ?? 'compact'),
  };
}

// ── Font family URL builders ───────────────────────────────────────────────
function fontUrls(baseUrl, family) {
  const map = {
    Montserrat: { regular: '/fonts/Montserrat-Regular.ttf', semiBold: '/fonts/Montserrat-SemiBold.ttf', bold: '/fonts/Montserrat-Bold.ttf' },
    Poppins:    { regular: '/fonts/Poppins-Regular.ttf',    semiBold: '/fonts/Poppins-SemiBold.ttf',    bold: '/fonts/Poppins-Bold.ttf' },
    'Sk-Modernist': { regular: '/fonts/Sk-Modernist-Regular.otf', semiBold: '/fonts/Sk-Modernist-Bold.otf', bold: '/fonts/Sk-Modernist-Bold.otf' },
  };
  const paths = map[family] ?? map['Poppins'];
  return {
    regular:  baseUrl + paths.regular,
    semiBold: baseUrl + paths.semiBold,
    bold:     baseUrl + paths.bold,
  };
}

// ── Coordinate helpers ─────────────────────────────────────────────────────
function pxRect(leftPx, topPx, widthPx, heightPx) {
  const x = leftPx * SCALE;
  const w = widthPx * SCALE;
  const h = heightPx * SCALE;
  const y = PAGE_H - topPx * SCALE - h;
  return { x, y, width: w, height: h };
}

function truncateToWidth(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + ellipsis, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function drawText(page, text, opts) {
  let size = opts.size;
  const minSize = opts.minSize ?? Math.max(8, opts.size - 6);
  const maxW = opts.maxWidthPx ? opts.maxWidthPx * SCALE : Infinity;
  while (size > minSize && opts.font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  const value = opts.font.widthOfTextAtSize(text, size) > maxW ? truncateToWidth(text, opts.font, size, maxW) : text;
  const x = opts.leftPx * SCALE;
  const y = PAGE_H - opts.topPx * SCALE - size * 0.78;
  page.drawText(value, { x, y, size, font: opts.font, color: opts.color });
}

function drawTextAligned(page, text, opts) {
  const size = opts.size;
  const maxW = opts.maxWidthPx ? opts.maxWidthPx * SCALE : Infinity;
  const value = opts.font.widthOfTextAtSize(text, size) > maxW ? truncateToWidth(text, opts.font, size, maxW) : text;
  const textW = opts.font.widthOfTextAtSize(value, size);
  const anchorXPt = opts.anchorXPx * SCALE;
  let x;
  if (opts.align === 'left') x = anchorXPt;
  else if (opts.align === 'right') x = anchorXPt - textW;
  else x = anchorXPt - textW / 2;
  const y = PAGE_H - opts.topPx * SCALE - size * 0.78;
  page.drawText(value, { x, y, size, font: opts.font, color: opts.color });
}

function drawTextCentered(page, text, opts) {
  const r = pxRect(opts.leftPx, opts.topPx, opts.widthPx, opts.heightPx);
  const maxW = r.width - 16;
  const minSize = opts.minSize ?? 10;
  let size = opts.size;
  let textW = opts.font.widthOfTextAtSize(text, size);
  while (textW > maxW && size > minSize) { size -= 0.5; textW = opts.font.widthOfTextAtSize(text, size); }
  let value = text;
  if (textW > maxW) { value = truncateToWidth(text, opts.font, size, maxW); textW = opts.font.widthOfTextAtSize(value, size); }
  const cap = size * 0.70;
  const x = r.x + (r.width - textW) / 2;
  const yOff = opts.yOffsetPdf ?? 0;
  const y = r.y + (r.height - cap) / 2 + yOff;
  page.drawText(value, { x, y, size, font: opts.font, color: opts.color });
}

function wrapAtSize(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function pick(override, fallback) {
  const v = (override ?? '').trim();
  return v.length > 0 ? override : fallback;
}

function fmtCompactIdr(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const trim = (s) => s.replace(/,0$/, '');
  if (n >= 1_000_000_000) return `${trim((n / 1_000_000_000).toFixed(1).replace('.', ','))} M`;
  if (n >= 1_000_000) return `${trim((n / 1_000_000).toFixed(1).replace('.', ','))} jt`;
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function fmtFullIdr(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function fmtCurrency(n, currency, mode = 'compact') {
  if (!n || !Number.isFinite(n) || n <= 0) return '—';
  if (currency === 'IDR') return mode === 'full' ? fmtFullIdr(n) : fmtCompactIdr(n);
  const rounded = Math.round(n);
  if (currency === 'SAR') return `SAR ${rounded.toLocaleString('en-US')}`;
  return `$${rounded.toLocaleString('en-US')}`;
}

function convertViaIdr(valueDisplay, valueIDR, sourceCur, targetCur, kursUSD = 1, kursSAR = 1) {
  if (sourceCur === targetCur) return valueDisplay;
  let idr;
  if (typeof valueIDR === 'number' && Number.isFinite(valueIDR) && valueIDR > 0) idr = valueIDR;
  else if (typeof valueDisplay === 'number' && Number.isFinite(valueDisplay) && valueDisplay > 0) {
    if (sourceCur === 'IDR') idr = valueDisplay;
    else if (sourceCur === 'USD') idr = valueDisplay * (kursUSD || 1);
    else idr = valueDisplay * (kursSAR || 1);
  } else return undefined;
  if (targetCur === 'IDR') return idr;
  if (targetCur === 'USD') return idr / (kursUSD || 1);
  return idr / (kursSAR || 1);
}

function splitOverrideOrUse(override, fallback) {
  const v = (override ?? '').trim();
  if (!v) return fallback;
  return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function maskChecklistDividers(page, centerXPx, baselinesPx) {
  const COL_WIDTH_PX = 235, DIGIT_RESERVE_PX = 26, LINE_OFFSET_PX = 4, MASK_HEIGHT_PX = 6;
  const leftEdgePx = centerXPx - COL_WIDTH_PX / 2 + DIGIT_RESERVE_PX;
  const widthPx = COL_WIDTH_PX - DIGIT_RESERVE_PX - 2;
  for (const baselinePx of baselinesPx) {
    const r = pxRect(leftEdgePx, baselinePx + LINE_OFFSET_PX, widthPx, MASK_HEIGHT_PX);
    page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: WHITE, borderWidth: 0 });
  }
}

function drawList(page, items, firstBaselinePx, rowSpacingPx, maxRows, anchorXPx, font, baseSize = 10, align = 'center', bullet = '•') {
  const cleaned = items.map((s) => s.trim()).filter(Boolean).slice(0, maxRows);
  const COL_WIDTH = 235, maxW = (COL_WIDTH - 8) * SCALE, anchorXPt = anchorXPx * SCALE;
  const prefix = bullet ? `${bullet} ` : '';
  const size = baseSize;
  const prefixW = font.widthOfTextAtSize(prefix, size);
  const lineAdvancePx = (size * 1.25) / SCALE;
  const interItemGapPx = Math.max(rowSpacingPx - lineAdvancePx, lineAdvancePx * 0.4);
  let cursorBaselinePx = firstBaselinePx;
  for (let i = 0; i < cleaned.length; i++) {
    const bodyMaxW = Math.max(0, maxW - prefixW);
    const wrappedBody = wrapAtSize(cleaned[i], font, size, bodyMaxW);
    const longestLineW = wrappedBody.reduce((mx, ln) => Math.max(mx, font.widthOfTextAtSize(ln, size)), 0);
    const blockW = prefixW + longestLineW;
    let blockLeftPt;
    if (align === 'left') blockLeftPt = anchorXPt;
    else if (align === 'right') blockLeftPt = anchorXPt - blockW;
    else blockLeftPt = anchorXPt - blockW / 2;
    const textXPt = blockLeftPt + prefixW;
    for (let li = 0; li < wrappedBody.length; li++) {
      const y = PAGE_H - cursorBaselinePx * SCALE;
      if (li === 0 && prefix) {
        page.drawText(prefix, { x: blockLeftPt, y, size, font, color: DARK });
        page.drawText(wrappedBody[li], { x: textXPt, y, size, font, color: DARK });
      } else {
        page.drawText(wrappedBody[li], { x: textXPt, y, size, font, color: DARK });
      }
      cursorBaselinePx += lineAdvancePx;
    }
    cursorBaselinePx += interItemGapPx - lineAdvancePx;
  }
}

function drawWhatsappFooter(page, pdf, opts) {
  const baseX = opts.leftXPx * SCALE;
  const baseY = PAGE_H - opts.topPx * SCALE;
  const r = opts.iconSizePt / 2;
  const cx = baseX + r;
  const cy = baseY + r * 0.4;
  page.drawCircle({ x: cx, y: cy, size: r, color: WA_GREEN, borderWidth: 0 });
  const phonePath = 'M 1.05 1.95 c 0.30 0.40 0.78 0.92 1.45 1.55 c 0.67 0.63 1.20 1.05 1.55 1.30 c 0.20 0.14 0.40 0.10 0.58 -0.05 l 0.50 -0.50 c 0.20 -0.20 0.45 -0.22 0.70 -0.10 l 1.45 0.75 c 0.25 0.13 0.30 0.40 0.15 0.65 c -0.40 0.65 -1.00 1.10 -1.85 1.20 c -0.85 0.10 -1.95 -0.20 -3.05 -0.95 c -1.10 -0.75 -2.10 -1.85 -2.85 -3.05 c -0.75 -1.10 -1.05 -2.20 -0.95 -3.05 c 0.10 -0.85 0.55 -1.45 1.20 -1.85 c 0.25 -0.15 0.52 -0.10 0.65 0.15 l 0.75 1.45 c 0.12 0.25 0.10 0.50 -0.10 0.70 l -0.50 0.50 c -0.15 0.18 -0.19 0.38 -0.05 0.58 z';
  const pathScale = (2 * r * 0.55) / 7;
  const svgX = cx - 3.5 * pathScale;
  const svgY = cy + 3.5 * pathScale;
  page.drawSvgPath(phonePath, { x: svgX, y: svgY, scale: pathScale, color: WHITE, borderWidth: 0 });
  const gap = 4;
  const textX = cx + r + gap;
  const textY = cy - opts.textSizePt * 0.32;
  page.drawText(opts.displayNumber, { x: textX, y: textY, size: opts.textSizePt, font: opts.font, color: DARK });
  const textWidth = opts.font.widthOfTextAtSize(opts.displayNumber, opts.textSizePt);
  const annotX1 = baseX, annotY1 = cy - r - 1, annotX2 = textX + textWidth + 1, annotY2 = cy + r + 1;
  const linkAnnot = pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [annotX1, annotY1, annotX2, annotY2], Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(opts.url) },
  });
  const linkRef = pdf.context.register(linkAnnot);
  const existing = page.node.lookup(PDFName.of('Annots'));
  if (existing && 'push' in existing) existing.push(linkRef);
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([linkRef]));
}

function whatsappDigits(raw) { return (raw ?? '').replace(/\D+/g, ''); }
function formatWhatsappDisplay(raw) {
  const d = whatsappDigits(raw);
  if (!d) return '';
  if (d.startsWith('62')) {
    const rest = d.slice(2);
    const a = rest.slice(0, 3), b = rest.slice(3, 7), c = rest.slice(7);
    return `+62 ${a}${b ? `-${b}` : ''}${c ? `-${c}` : ''}`.trim();
  }
  return `+${d}`;
}
function whatsappUrl(raw) { return `https://wa.me/${whatsappDigits(raw)}`; }

async function buildIghPdf(data, layout, adminSettings, baseUrl) {
  const isGroup = data.mode === 'group';
  const modeDefault = isGroup ? GROUP_LAYOUT : DEFAULT_IGH_LAYOUT;
  const cfg = mergeConfig(modeDefault, layout);
  const priceMode = cfg.priceDisplayMode ?? 'compact';

  const TEMPLATE_URL = baseUrl + '/igh-blank-template.pdf';
  const TEMPLATE_GROUP_URL = baseUrl + '/templates/IGH_Blank_Template_Group.pdf';
  const defaultTplUrl = isGroup ? TEMPLATE_GROUP_URL : TEMPLATE_URL;

  const fetchBytes = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gagal ambil ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const bytesCache = new Map();
  const fetchBytesCached = async (url) => {
    if (!bytesCache.has(url)) bytesCache.set(url, fetchBytes(url));
    return bytesCache.get(url);
  };

  let pdf;
  const customTpl = cfg.customTemplate;
  if (customTpl?.type === 'pdf') {
    try {
      pdf = await PDFDocument.load(await fetchBytes(customTpl.url));
    } catch {
      pdf = await PDFDocument.load(await fetchBytesCached(defaultTplUrl));
    }
  } else if (customTpl?.type === 'image') {
    pdf = await PDFDocument.create();
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    try {
      const bytes = await fetchBytes(customTpl.url);
      const isPng = /\.png(\?|$)/i.test(customTpl.url) || /image\/png/i.test(customTpl.name ?? '');
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const ir = img.width / img.height, pr = PAGE_W / PAGE_H;
      let drawW, drawH;
      if (ir > pr) { drawH = PAGE_H; drawW = drawH * ir; }
      else { drawW = PAGE_W; drawH = drawW / ir; }
      page.drawImage(img, { x: (PAGE_W - drawW) / 2, y: (PAGE_H - drawH) / 2, width: drawW, height: drawH });
    } catch { /* empty background fallback */ }
  } else {
    pdf = await PDFDocument.load(await fetchBytesCached(defaultTplUrl));
  }

  pdf.registerFontkit(fontkit);

  const usedFamilies = new Set([cfg.fonts.family]);
  for (const fam of Object.values(cfg.fonts.overrides ?? {})) { if (fam) usedFamilies.add(fam); }

  const familyFonts = {};
  await Promise.all(Array.from(usedFamilies).map(async (fam) => {
    const urls = fontUrls(baseUrl, fam);
    const [regBytes, sbBytes, boldBytes] = await Promise.all([
      fetchBytesCached(urls.regular), fetchBytesCached(urls.semiBold), fetchBytesCached(urls.bold),
    ]);
    familyFonts[fam] = {
      regular:  await pdf.embedFont(regBytes,  { subset: true }),
      semiBold: await pdf.embedFont(sbBytes,   { subset: true }),
      bold:     await pdf.embedFont(boldBytes, { subset: true }),
    };
  }));

  void (await pdf.embedFont(StandardFonts.Helvetica));

  const fontFor = (section, weight) => {
    const fam = cfg.fonts.overrides?.[section] ?? cfg.fonts.family;
    const set = familyFonts[fam] ?? familyFonts[cfg.fonts.family];
    return set[weight];
  };

  const page = pdf.getPage(0);

  // ── 1. PROJECT name + timeline ──
  const projectName = pick(cfg.projectName.text, (data.projectName || '—').trim());
  const projMaxW = 285 * SCALE;
  const projBold = fontFor('projectName', 'bold');
  const projReg  = fontFor('projectName', 'regular');
  const projAlign = cfg.projectName.align ?? 'left';
  const MAX_TITLE_LINES = 4;
  const manualSegments = projectName.split('\n');
  let projSize = cfg.projectName.size;
  let projLines = [];
  while (projSize > 14) {
    projLines = [];
    for (const seg of manualSegments) {
      if (!seg.trim()) { projLines.push(''); continue; }
      projLines.push(...wrapAtSize(seg, projBold, projSize, projMaxW));
    }
    if (projLines.length <= MAX_TITLE_LINES) break;
    projSize -= 1;
  }
  if (projLines.length > MAX_TITLE_LINES) projLines = projLines.slice(0, MAX_TITLE_LINES);
  const projLH = projSize + cfg.projectName.lineGapPx;
  let py = cfg.projectName.topPx;
  for (const ln of projLines) {
    if (ln) drawTextAligned(page, ln, { anchorXPx: cfg.projectName.xPx, topPx: py, size: projSize, font: projBold, color: BRAND_BLUE, align: projAlign, maxWidthPx: 285 });
    py += projLH;
  }

  const subtitleGap = cfg.mainHeaderGap ?? cfg.headerSubtitleGap ?? 6;
  const subtitleXOff = cfg.headerSubtitleOffset?.xPx ?? 0;
  const subtitleYOff = cfg.headerSubtitleOffset?.yPx ?? 0;
  const SUBTITLE_PT = cfg.subtitleFontSize ?? 11;
  const subtitleWidthPx = cfg.subtitleWidthPx ?? 285;
  const subtitleMaxW = subtitleWidthPx * SCALE;
  const dateMode = cfg.dateDisplayMode ?? 'Short';
  const timelineText = (dateMode === 'Short' ? (data.timelineShort || data.timeline) : data.timeline) || '—';
  const subtitleLines = wrapAtSize(timelineText, projReg, SUBTITLE_PT, subtitleMaxW);
  const subtitleLineAdvancePx = SUBTITLE_PT * 1.25;
  let subtitleY = py + subtitleGap + subtitleYOff;
  for (const ln of subtitleLines) {
    drawTextAligned(page, ln, { anchorXPx: cfg.projectName.xPx + subtitleXOff, topPx: subtitleY, size: SUBTITLE_PT, font: projReg, color: GREY_MUTED, align: projAlign, maxWidthPx: subtitleWidthPx });
    subtitleY += subtitleLineAdvancePx;
  }

  // ── 2. HEADER META ──
  const metaReg = fontFor('metaInfo', 'regular');
  const customerY = cfg.metaInfo.customerYPx ?? cfg.metaInfo.topPx;
  const dateY = cfg.metaInfo.dateYPx ?? cfg.metaInfo.topPx;
  drawText(page, pick(cfg.metaInfo.customerText, data.customerName || '—'), { leftPx: cfg.metaInfo.customerXPx, topPx: customerY, size: cfg.metaInfo.size, font: metaReg, color: BRAND_BLUE, maxWidthPx: 175 });
  drawText(page, pick(cfg.metaInfo.dateText, data.date || '—'), { leftPx: cfg.metaInfo.dateXPx, topPx: dateY, size: cfg.metaInfo.size, font: metaReg, color: BRAND_BLUE, maxWidthPx: 175 });

  // ── 3. HOTEL ──
  const hotelBold = fontFor('hotel', 'bold');
  const hotelReg  = fontFor('hotel', 'regular');
  const subtitleSize = Math.max(7, Math.min(14, cfg.hotel.size * 0.45));
  drawText(page, pick(cfg.hotel.makkahText, data.hotelMakkah || '—'), { leftPx: cfg.hotel.makkahXPx, topPx: cfg.hotel.topPx, size: cfg.hotel.size, minSize: 12, font: hotelBold, color: BRAND_BLUE, maxWidthPx: 285 });
  drawText(page, `${Math.max(0, data.makkahNights || 0)} Malam`, { leftPx: cfg.hotel.makkahXPx, topPx: cfg.hotel.topPx + cfg.hotel.subtitleOffsetPx, size: subtitleSize, font: hotelReg, color: DARK });
  drawText(page, pick(cfg.hotel.madinahText, data.hotelMadinah || '—'), { leftPx: cfg.hotel.madinahXPx, topPx: cfg.hotel.topPx, size: cfg.hotel.size, minSize: 12, font: hotelBold, color: BRAND_BLUE, maxWidthPx: 285 });
  drawText(page, `${Math.max(0, data.madinahNights || 0)} Malam`, { leftPx: cfg.hotel.madinahXPx, topPx: cfg.hotel.topPx + cfg.hotel.subtitleOffsetPx, size: subtitleSize, font: hotelReg, color: DARK });

  // ── 4. PRICING ──
  if (isGroup) {
    const gp = cfg.groupPricing;
    const groupBold = fontFor('groupPricing', 'bold');
    const rows = data.groupPricing ?? [];
    const targetCur = cfg.pdfCurrency ?? (gp.currencySymbol.trim().toLowerCase().startsWith('rp') ? 'IDR' : gp.currencySymbol.trim().toUpperCase().startsWith('SAR') ? 'SAR' : 'USD');
    const sourceCur = data.displayCurrency ?? 'USD';
    const kursUSD = data.kursIdrPerUsd ?? 1;
    const kursSAR = data.kursIdrPerSar ?? 1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const topPx = gp.topPx + i * gp.rowSpacingPx;
      const COL_W = 110;
      const cell = (centerXPx, text) => drawTextCentered(page, text, { leftPx: centerXPx - COL_W / 2, topPx, widthPx: COL_W, heightPx: gp.cellHeightPx, size: gp.size, minSize: 9, font: groupBold, color: BRAND_BLUE });
      const q = convertViaIdr(row.quad, row.quadIDR, sourceCur, targetCur, kursUSD, kursSAR);
      const t = convertViaIdr(row.triple, row.tripleIDR, sourceCur, targetCur, kursUSD, kursSAR);
      const d = convertViaIdr(row.double, row.doubleIDR, sourceCur, targetCur, kursUSD, kursSAR);
      cell(gp.paxCenterXPx, row.paxLabel || '—');
      cell(gp.quadCenterXPx   + gp.quadXOffsetPx,   fmtCurrency(q, targetCur, priceMode));
      cell(gp.tripleCenterXPx + gp.tripleXOffsetPx, fmtCurrency(t, targetCur, priceMode));
      cell(gp.doubleCenterXPx + gp.doubleXOffsetPx, fmtCurrency(d, targetCur, priceMode));
    }
  } else {
    const priceBold = fontFor('pricing', 'bold');
    const PAX_BOX   = { leftPx: cfg.pricing.paxXPx,   topPx: cfg.pricing.topPx, widthPx: 114, heightPx: 61 };
    const PRICE_BOX = { leftPx: cfg.pricing.priceXPx, topPx: cfg.pricing.topPx, widthPx: 406, heightPx: 61 };
    const paxText = pick(cfg.pricing.paxText, String(Math.max(0, data.pax || 0)));
    const targetCur = cfg.pdfCurrency ?? 'IDR';
    const priceInTarget = convertViaIdr(undefined, data.pricePerPaxIDR || 0, 'IDR', targetCur, data.kursIdrPerUsd ?? 1, data.kursIdrPerSar ?? 1);
    const priceText = pick(cfg.pricing.priceText, fmtCurrency(targetCur === 'IDR' ? (data.pricePerPaxIDR || 0) : priceInTarget, targetCur, priceMode));
    drawTextCentered(page, paxText,   { ...PAX_BOX,   size: cfg.pricing.size + 4, minSize: 14, font: priceBold, color: WHITE, yOffsetPdf: cfg.pricing.yOffsetPdf });
    drawTextCentered(page, priceText, { ...PRICE_BOX, size: cfg.pricing.size,     minSize: 12, font: priceBold, color: WHITE, yOffsetPdf: cfg.pricing.yOffsetPdf });
  }

  // ── 5. CHECKLIST ──
  const listFont = fontFor('checklist', 'semiBold');
  const firstBaselinePxResolved = cfg.checklist.firstBaselinePx + cfg.checklist.yOffsetPx;
  const MAX_LIST_ROWS = 5;
  const ROW_BASELINES_FOR_MASK = Array.from({ length: MAX_LIST_ROWS }, (_, i) =>
    cfg.checklist.firstBaselinePx + i * cfg.checklist.rowSpacingPx + cfg.checklist.yOffsetPx
  );
  const includedItems = splitOverrideOrUse(cfg.checklist.includedText, data.included);
  const excludedItems = splitOverrideOrUse(cfg.checklist.excludedText, data.excluded);
  maskChecklistDividers(page, cfg.checklist.leftXPx,  ROW_BASELINES_FOR_MASK);
  maskChecklistDividers(page, cfg.checklist.rightXPx, ROW_BASELINES_FOR_MASK);
  const bulletSymbol = (cfg.checklist.listBullet ?? '•').trim();
  drawList(page, includedItems, firstBaselinePxResolved, cfg.checklist.rowSpacingPx, MAX_LIST_ROWS, cfg.checklist.leftXPx,  listFont, cfg.checklist.size, cfg.checklist.sudahTermasukAlign ?? 'center', bulletSymbol);
  drawList(page, excludedItems, firstBaselinePxResolved, cfg.checklist.rowSpacingPx, MAX_LIST_ROWS, cfg.checklist.rightXPx, listFont, cfg.checklist.size, cfg.checklist.belumTermasukAlign ?? 'center', bulletSymbol);

  // ── 6. FOOTER (WhatsApp) ──
  if (cfg.footer.showWhatsapp && adminSettings?.adminWhatsapp) {
    const digits = whatsappDigits(adminSettings.adminWhatsapp);
    if (digits.length >= 8) {
      const waYPx = cfg.whatsappPosition?.yPx ?? cfg.footer.topPx;
      const waXPx = cfg.whatsappPosition?.xPx ?? cfg.footer.waXPx;
      drawWhatsappFooter(page, pdf, {
        topPx: waYPx, leftXPx: waXPx,
        iconSizePt: cfg.footer.waIconSizePt, textSizePt: cfg.footer.size,
        font: fontFor('footer', 'semiBold'),
        displayNumber: formatWhatsappDisplay(adminSettings.adminWhatsapp),
        url: whatsappUrl(adminSettings.adminWhatsapp),
      });
    }
  }

  return pdf.save();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data, layout, adminSettings, baseUrl: bodyBaseUrl } = req.body ?? {};
    if (!data) return res.status(400).json({ error: 'Missing data' });

    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    const host  = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
    const baseUrl = bodyBaseUrl || (host ? `${proto}://${host}` : '');
    if (!baseUrl) return res.status(400).json({ error: 'Cannot resolve base URL for assets' });

    const pdfBytes = await buildIghPdf(data, layout, adminSettings, baseUrl);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="temantiket-penawaran.pdf"');
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('[api/export/igh]', e);
    res.status(500).json({ error: e.message });
  }
}
