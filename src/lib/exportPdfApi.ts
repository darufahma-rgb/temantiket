/**
 * Client-side wrapper that calls Vercel serverless functions for PDF generation.
 * Falls back to local (browser-side) generation if the API call fails.
 */
import type { InvoiceData } from './invoiceGenerator';
import type { IghPdfData, IghLayoutConfig } from './generateIghPdf';
import { generateInvoicePdf } from './invoiceGenerator';
import { buildIghPdf, downloadIghPdf } from './generateIghPdf';
import { loadIghAdminSettings } from './ighSettings';

/** Generate invoice PDF via Vercel serverless function.
 *  Falls back to browser-side pdf-lib if the API is unavailable. */
export async function generateInvoicePdfRemote(data: InvoiceData): Promise<Uint8Array> {
  try {
    const res = await fetch('/api/export/invoice', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn('[exportPdfApi] Falling back to browser PDF generation:', err);
    return generateInvoicePdf(data);
  }
}

/** Download IGH (penawaran umrah) PDF via Vercel serverless function.
 *  Falls back to browser-side pdf-lib if the API is unavailable. */
export async function downloadIghPdfRemote(
  data: IghPdfData,
  fileName?: string,
  layout?: Partial<IghLayoutConfig>,
): Promise<void> {
  const adminSettings = loadIghAdminSettings();
  const baseUrl = window.location.origin;

  try {
    const res = await fetch('/api/export/igh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, layout, adminSettings, baseUrl }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (data.projectName || 'Temantiket-Penawaran').replace(/[^a-z0-9-_]+/gi, '_');
    a.download = fileName || `${safe}_${(data.customerName || 'Customer').replace(/[^a-z0-9-_]+/gi, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.warn('[exportPdfApi] Falling back to browser IGH PDF generation:', err);
    await downloadIghPdf(data, fileName, layout);
  }
}

/** Build IGH PDF bytes via Vercel serverless function.
 *  Falls back to browser-side pdf-lib if the API is unavailable. */
export async function buildIghPdfRemote(
  data: IghPdfData,
  layout?: Partial<IghLayoutConfig>,
): Promise<Uint8Array> {
  const adminSettings = loadIghAdminSettings();
  const baseUrl = window.location.origin;

  try {
    const res = await fetch('/api/export/igh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, layout, adminSettings, baseUrl }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn('[exportPdfApi] Falling back to browser IGH PDF generation:', err);
    return buildIghPdf(data, layout);
  }
}
