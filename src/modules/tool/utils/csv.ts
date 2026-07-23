type CsvRow = Record<string, unknown>;

const stringifyCell = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const escapeCsvCell = (value: unknown): string => {
  const text = stringifyCell(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

export const rowsToCsv = (rows: CsvRow[]): string => {
  const headers = Array.from(
    rows.reduce<Set<string>>((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>())
  );

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((key) => escapeCsvCell(row[key])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
};

export const parseCsv = (text: string): CsvRow[] => {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => (
      headers.reduce<CsvRow>((acc, header, index) => {
        if (header) acc[header] = values[index] ?? '';
        return acc;
      }, {})
    ));
};
