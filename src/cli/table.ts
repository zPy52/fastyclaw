export function formatTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = rows[0].map((_, columnIndex) => (
    Math.max(...rows.map((row) => String(row[columnIndex] ?? '').length))
  ));

  return rows.map((row) => row.map((cell, columnIndex) => {
    const text = String(cell);
    if (columnIndex === row.length - 1) return text;
    return text.padEnd(widths[columnIndex]);
  }).join('  ')).join('\n');
}
