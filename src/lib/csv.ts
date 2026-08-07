// CSV 내보내기 — UTF-8 BOM(엑셀에서 한글 안 깨짐). 무의존성.
function cell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const body = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  const BOM = String.fromCharCode(0xfeff)
  const blob = new Blob([BOM + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
