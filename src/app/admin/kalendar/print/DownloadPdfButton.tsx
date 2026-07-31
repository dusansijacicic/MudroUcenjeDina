'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Snima tabelu kao sliku (html2canvas) pa je ubacuje u PDF (jsPDF) – umesto vektorskog teksta preko
 * jsPDF fontova (koji podrazumevano ne podržavaju č/ć/đ/š/ž), ovo garantovano ispravno prikazuje
 * srpsku latinicu jer koristi stvarni font iz browsera, samo kao sliku.
 */
export default function DownloadPdfButton({
  fileName,
  targetId,
  label = '⬇ Preuzmi PDF',
}: {
  fileName: string;
  targetId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const el = document.getElementById(targetId);
      if (!el) throw new Error('Tabela nije pronađena.');

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const imgWidth = canvas.width * scale;
      const imgHeight = canvas.height * scale;

      pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight);
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška pri generisanju PDF-a.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Generišem…' : label}
    </button>
  );
}
