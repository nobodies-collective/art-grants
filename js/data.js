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

function driveToDirectUrl(url) {
  const match = url.match(/drive\.google\.com\/(?:open\?id=|file\/d\/)([a-zA-Z0-9_-]+)/);
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`;
  return url;
}

export function mapRowToProposal(row, headers, index = null) {
  const title = findColumn(row, headers, ['Title', 'title']) || 'Untitled Proposal';

  // Image priority: Hero image first, then other uploaded images, then placeholder
  const heroImage = findColumn(row, headers, ['Hero image', 'hero image', 'Cover image', 'cover image']) || '';
  const rawFiles = findColumn(row, headers, ['Files', 'files']) || '';
  const rawImage = findColumn(row, headers, ['Image', 'image', 'Images', 'images']) || '';

  const images = [];
  // Hero/cover image comes first
  if (heroImage) {
    heroImage.split(/[,\n]+/).map(u => u.trim()).filter(Boolean).forEach(u => images.push(driveToDirectUrl(u)));
  }
  // Then other uploaded files/images
  [rawFiles, rawImage].forEach(raw => {
    raw.split(/[,\n]+/).map(u => u.trim()).filter(Boolean).forEach(u => {
      const url = driveToDirectUrl(u);
      if (!images.includes(url)) images.push(url);
    });
  });

  if (!images.length) {
    // Warm earthy palette matching the sunset background
    const palette = ['d4c4a8', 'c9b99a', 'bfae8e', 'd1c0a5', 'c4b193', 'cfc0aa', 'b8a88f', 'c7b89e'];
    let hash = 0;
    for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
    const hex = palette[Math.abs(hash) % palette.length];
    images.push(`https://placehold.co/800x450/${hex}/${hex}`);
  }
  const imageUrl = images[0];

  const timestamp = findColumn(row, headers, ['Timestamp', 'timestamp']);
  const year = deriveYear(timestamp);
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
    scaleFootprint: findColumn(row, headers, ['Scale & Footprint', 'Scale &amp; Footprint']),
    sound: findColumn(row, headers, ['Sound', 'sound']),
    otherFunding: findColumn(row, headers, ['Other Funding', 'other funding']),
    summary: findColumn(row, headers, ['Summary', 'summary']),
    materials: findColumn(row, headers, ['Materials', 'materials']),
    engineering: findColumn(row, headers, ['Engineering & structure', 'Engineering &amp; structure']),
    safety: findColumn(row, headers, ['Risk & Safety Management', 'Risk &amp; Safety Management', 'Safety & Risk Management', 'Safety &amp; Risk Management']),
    tags: findColumn(row, headers, ['Tags', 'tags']),
    buildTransportStrike: findColumn(row, headers, ['Build, Transport & Strike', 'Build, Transport &amp; Strike']),
    placementPreferences: findColumn(row, headers, ['Placement Preferences', 'placement preferences']),
    technology: findColumn(row, headers, ['Technology', 'technology']),
    power: findColumn(row, headers, ['Power', 'power']),
    experienceInteraction: findColumn(row, headers, ['Experience & Interaction', 'Experience &amp; Interaction']),
    grantRequest: findColumn(row, headers, ['Grant Request (EUR)', 'Grant Request (EUR) ', 'Grant Request']),
    team: findColumn(row, headers, ['Team', 'team']),
    comments: findColumn(row, headers, ['Comments', 'comments']),
    coverImage: imageUrl,
    images,
    messagingOn: findColumn(row, headers, ['Messaging On', 'messaging on', 'Messaging']).toLowerCase() === 'true',
  };
}

function deriveYear(timestamp) {
  if (!timestamp) return '';
  // Try parsing common formats: "DD/MM/YYYY HH:MM:SS" or "YYYY-MM-DD..."
  const str = timestamp.toString().trim();
  // DD/MM/YYYY format
  const dmyMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) return dmyMatch[3];
  // YYYY-MM-DD or YYYY/MM/DD format
  const ymdMatch = str.match(/^(\d{4})[-/]/);
  if (ymdMatch) return ymdMatch[1];
  // Fallback: try Date parse
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.getFullYear().toString();
  return '';
}
