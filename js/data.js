import { CSV_URL, PLACEHOLDER_IMAGE_BASE } from './constants.js';
import { parseCSV, findColumn, generateSlug } from './utils.js';

const CACHE_KEY = 'art-grants-csv';
const CACHE_TS_KEY = 'art-grants-csv-ts';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchSpreadsheetData(prefetchPromise) {
  // Try cache first for instant render
  const cached = localStorage.getItem(CACHE_KEY);
  const cachedTs = Number(localStorage.getItem(CACHE_TS_KEY) || 0);
  const cacheValid = cached && (Date.now() - cachedTs < CACHE_TTL);

  let csvText;

  if (cacheValid) {
    // Use cache immediately, refresh in background
    csvText = cached;
    (prefetchPromise || fetch(CSV_URL).then(r => r.ok ? r.text() : null))
      .then(text => {
        if (text) {
          localStorage.setItem(CACHE_KEY, text);
          localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
        }
      })
      .catch(() => {});
  } else {
    // No valid cache — await the prefetched or fresh request
    try {
      csvText = await (prefetchPromise || fetch(CSV_URL).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch data: ${r.status} ${r.statusText}`);
        return r.text();
      }));
      localStorage.setItem(CACHE_KEY, csvText);
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) {
      // If network fails but we have stale cache, use it
      if (cached) {
        csvText = cached;
      } else {
        throw e;
      }
    }
  }

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
    about: findColumn(row, headers, ['About', 'about']),
    description: findColumn(row, headers, ['Description', 'description']),
    scaleFootprint: findColumn(row, headers, ['Scale & Footprint', 'Scale &amp; Footprint']),
    sound: findColumn(row, headers, ['Sound', 'sound']),
    supportNeeded: findColumn(row, headers, ['Support Needed', 'support needed']),
    totalBudget: findColumn(row, headers, ['Total Project Budget (EUR)', 'Total Project Budget']),
    earlyEntry: findColumn(row, headers, ['Early Entry', 'early entry']),
    budget: findColumn(row, headers, ['Budget', 'budget']),
    otherFunding: findColumn(row, headers, ['Other Funding', 'other funding']),
    summary: findColumn(row, headers, ['Summary', 'summary']),
    materials: findColumn(row, headers, ['Materials', 'materials']),
    engineering: findColumn(row, headers, ['Engineering & structure', 'Engineering &amp; structure']),
    safety: findColumn(row, headers, ['Safety & Risk Management', 'Safety &amp; Risk Management']),
    buildTransportStrike: findColumn(row, headers, ['Build, Transport & Strike', 'Build, Transport &amp; Strike']),
    placementPreferences: findColumn(row, headers, ['Placement Preferences', 'placement preferences']),
    technology: findColumn(row, headers, ['Technology', 'technology']),
    power: findColumn(row, headers, ['Power', 'power']),
    experienceInteraction: findColumn(row, headers, ['Experience & Interaction', 'Experience &amp; Interaction']),
    grantRequest: findColumn(row, headers, ['Grant Request (EUR)', 'Grant Request (EUR) ', 'Grant Request']),
    documents: findColumn(row, headers, ['Documents', 'documents']),
    team: findColumn(row, headers, ['Team', 'team']),
    sexPositive: findColumn(row, headers, ['Sex-positive', 'sex-positive']),
    type: findColumn(row, headers, ['Type', 'type']),
    comments: findColumn(row, headers, ['Comments', 'comments']),
    coverImage: imageUrl,
    statusLabel: formatStatusLabel(status),
    statusClass: formatStatusClass(status),
    statusKey: formatStatusClass(status),
    messagingOn: findColumn(row, headers, ['Messaging On', 'messaging on', 'Messaging']).toLowerCase() === 'true',
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
