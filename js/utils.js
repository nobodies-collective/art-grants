export function escapeHtml(text = '') {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function formatText(text = '') {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

export function generateSlug(title = '') {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseCSV(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] };

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.trim())) {
        rows.push([...currentRow]);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.trim())) {
      rows.push(currentRow);
    }
  }

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => header.trim());
  const dataRows = rows
    .slice(1)
    .map((row) => {
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = (row[index] || '').trim();
      });
      return rowObj;
    })
    .filter((row) => Object.values(row).some((value) => value && value.trim()));

  return { headers, rows: dataRows };
}

export function getFieldValue(row, headers, fieldName) {
  const normalized = fieldName.toLowerCase().trim();

  if (row[fieldName] !== undefined && row[fieldName] !== null) {
    return String(row[fieldName]).trim();
  }

  const exactHeader = headers.find((header) => header.toLowerCase().trim() === normalized);
  if (exactHeader && row[exactHeader] !== undefined && row[exactHeader] !== null) {
    return String(row[exactHeader]).trim();
  }

  const partialHeader = headers.find((header) => {
    const normalizedHeader = header.toLowerCase().trim();
    return normalizedHeader.includes(normalized) || normalized.includes(normalizedHeader);
  });

  if (partialHeader && row[partialHeader] !== undefined && row[partialHeader] !== null) {
    return String(row[partialHeader]).trim();
  }

  return '';
}

export function findColumn(row, headers, candidates) {
  for (const name of candidates) {
    const value = getFieldValue(row, headers, name);
    if (value) return value;
  }
  return '';
}

export function getDisplayName(proposal) {
  return proposal.name || '';
}



