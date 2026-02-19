import { CSV_URL, PLACEHOLDER_IMAGE_BASE } from './constants.js';
import { parseCSV, findColumn, generateSlug } from './utils.js';

export async function fetchSpreadsheetData() {
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  return parseCSV(csvText);
}

export function mapRowToProposal(row, headers, index = null) {
  const title = findColumn(row, headers, ['Title', 'title']) || 'Untitled Proposal';
  let imageUrl = findColumn(row, headers, ['Image', 'image']) || '';
  imageUrl = imageUrl.trim();

  if (!imageUrl) {
    const encodedTitle = encodeURIComponent(title);
    imageUrl = `${PLACEHOLDER_IMAGE_BASE}?q=${encodedTitle}`;
  }

  const status = findColumn(row, headers, ['Status', 'status']);

  const year = findColumn(row, headers, ['Year', 'year']);
  const slug = generateSlug(title);
  // Create unique key: always include index to ensure uniqueness even for duplicates
  const yearStr = (year || '').trim();
  const uniqueKey = yearStr ? `${slug}-${yearStr}-${index}` : (index !== null ? `${slug}-${index}` : `${slug}-${Math.random().toString(36).substr(2, 9)}`);
  
  return {
    title,
    titleLower: title.toLowerCase(),
    slug,
    uniqueKey,
    year,
    category: findColumn(row, headers, ['Category', 'category']),
    name: findColumn(row, headers, ['Artist name', 'artist name', 'Name', 'name', 'Artist', 'artist']),
    description: findColumn(row, headers, ['Description', 'description']),
    technicalDetails: findColumn(row, headers, ['Technical details', 'Technical Details']),
    spaceRequirements: findColumn(row, headers, ['Space requirements', 'Space Requirements']),
    locationRequirements: findColumn(
      row,
      headers,
      ['Location requirements', 'Location Requirements']
    ),
    powerRequirements: findColumn(row, headers, ['Power requirements', 'Power Requirements']),
    sound: findColumn(row, headers, ['Sound', 'sound']),
    safety: findColumn(row, headers, ['Safety', 'safety']),
    strike: findColumn(row, headers, ['Strike', 'strike']),
    coCreation: findColumn(row, headers, ['Co-creation', 'Co-creation']),
    team: findColumn(row, headers, ['Team', 'team']),
    budget: findColumn(row, headers, ['Budget', 'budget']),
    coverImage: imageUrl,
    statusLabel: formatStatusLabel(status),
    statusClass: formatStatusClass(status),
    statusKey: formatStatusClass(status),
    orderIndex: Math.random(),
  };
}

function formatStatusClass(status) {
  if (!status) return 'under-review';
  const normalized = status.toLowerCase().trim().replace(/\s+/g, ' ');
  // Check for self-funded first (before regular funded)
  if ((normalized.includes('self') && normalized.includes('funded')) || 
      normalized === 'self-funded' || 
      normalized === 'self funded' ||
      (normalized.includes('art') && normalized.includes('no') && normalized.includes('grant'))) {
    return 'self-funded';
  }
  if (normalized.includes('not') && normalized.includes('funded')) return 'not-funded';
  if (normalized.includes('funded') && !normalized.includes('not')) return 'funded';
  if (normalized.includes('review') || normalized.includes('under')) return 'under-review';
  return 'under-review';
}

function formatStatusLabel(status) {
  if (!status) return 'Under Review';
  const normalized = status.toLowerCase().trim().replace(/\s+/g, ' ');
  // Check for self-funded first (before regular funded)
  if ((normalized.includes('self') && normalized.includes('funded')) || 
      normalized === 'self-funded' || 
      normalized === 'self funded' ||
      (normalized.includes('art') && normalized.includes('no') && normalized.includes('grant'))) {
    return 'Self-funded';
  }
  if (normalized.includes('not') && normalized.includes('funded')) return 'Not Funded';
  if (normalized.includes('funded') && !normalized.includes('not')) return 'Funded';
  if (normalized.includes('review') || normalized.includes('under')) return 'Under Review';
  return 'Under Review';
}



