import { yearFilters, state } from './state.js';
import { fetchSpreadsheetData, mapRowToProposal } from './data.js';
import { escapeHtml, formatText, getDisplayName } from './utils.js';
import { createChatSection } from './chat.js';

const BASE_TITLE = document.title;

let proposalsContainer;
let loadingEl;
let errorEl;
let sortSelect;
let proposalCountEl;
let searchInput;
let yearFiltersContainer;
let isInitialLoad = true;
let cardElements = new Map();

// Detect base path so /repo-name/year/slug works on GitHub Pages
const BASE_PATH = window.location.pathname.replace(/\/\d{4}\/[^/]+\/?$/, '').replace(/\/+$/, '');

function getProposalFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/(\d{4})\/([^/]+)\/?$/);
  return match ? { year: match[1], slug: match[2] } : null;
}

function proposalUrl(proposal) {
  const year = proposal.year || 'unknown';
  return `${BASE_PATH}/${year}/${proposal.slug}`;
}

function baseUrl() {
  return BASE_PATH || '/';
}

export function initUI() {
  proposalsContainer = document.getElementById('proposals-list');
  loadingEl = document.getElementById('loading');
  errorEl = document.getElementById('error');
  sortSelect = document.getElementById('sort-select');
  proposalCountEl = document.getElementById('proposal-count');
  searchInput = document.getElementById('search-input');
  yearFiltersContainer = document.getElementById('year-filters-container');

  attachEventListeners();
  loadData();
}

function attachEventListeners() {
  sortSelect.addEventListener('change', (event) => {
    state.sortMode = event.target.value;
    applyFiltersAndRender();
  });

  if (searchInput) {
    let searchDebounce;
    searchInput.addEventListener('input', (event) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = event.target.value.trim().toLowerCase();
        applyFiltersAndRender();
      }, 150);
    });
  }

  window.addEventListener('popstate', () => {
    const info = getProposalFromPath();
    if (info) {
      if (state.currentProjectPage) {
        state.currentProjectPage.remove();
        state.currentProjectPage = null;
      }
      const proposal = state.proposalData.find(
        (item) => item.slug === info.slug && (item.year || 'unknown') === info.year
      );
      if (proposal) openProposalPage(proposal, { skipPushState: true });
    } else {
      if (state.currentProjectPage) {
        state.currentProjectPage.remove();
        state.currentProjectPage = null;
        document.querySelector('.layout').style.display = '';
      }
    }
  });
}

function buildYearFilters() {
  if (!yearFiltersContainer || !state.proposalData.length) return;
  
  // Clear existing year filters
  Object.keys(yearFilters).forEach(key => delete yearFilters[key]);
  
  // Get unique years from proposals
  const years = new Set();
  state.proposalData.forEach((proposal) => {
    if (proposal.year && proposal.year.trim()) {
      years.add(proposal.year.trim());
    }
  });
  
  // Sort years descending
  const sortedYears = Array.from(years).sort((a, b) => {
    const numA = parseInt(a) || 0;
    const numB = parseInt(b) || 0;
    return numB - numA;
  });
  
  // Clear existing buttons
  yearFiltersContainer.innerHTML = '';

  // Hide year filters if only one year exists
  if (sortedYears.length <= 1) {
    sortedYears.forEach(year => { yearFilters[year] = true; });
    return;
  }

  // Initialize only the most recent year as active, all others as inactive
  sortedYears.forEach((year, index) => {
    yearFilters[year] = index === 0; // Only first (most recent) year is true
  });
  
  // Create buttons
  sortedYears.forEach((year, index) => {
    const isActive = index === 0; // Only most recent year is active
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isActive ? 'year-chip is-active' : 'year-chip';
    button.dataset.year = year;
    button.setAttribute('aria-pressed', String(isActive));
    button.textContent = year;
    button.addEventListener('click', () => {
      yearFilters[year] = !yearFilters[year];
      button.classList.toggle('is-active', yearFilters[year]);
      button.setAttribute('aria-pressed', String(yearFilters[year]));
      applyFiltersAndRender();
    });
    yearFiltersContainer.appendChild(button);
  });
}

async function loadData() {
  try {
    showLoading(true);
    const { prefetch } = await import('./main.js');
    const { headers, rows } = await fetchSpreadsheetData(prefetch);
    if (!rows.length) {
      showError('No proposals available.');
      showLoading(false);
      return;
    }

    state.proposalData = rows.map((row, index) => mapRowToProposal(row, headers, index));
    buildYearFilters();
    updateProposalCount(state.proposalData.length, state.proposalData.length);
    applyFiltersAndRender();
    showLoading(false);
    document.body.classList.remove('is-loading');

    const initialInfo = getProposalFromPath();
    if (initialInfo) {
      const initialProposal = state.proposalData.find(
        (item) => item.slug === initialInfo.slug && (item.year || 'unknown') === initialInfo.year
      );
      if (initialProposal) {
        openProposalPage(initialProposal);
      }
    }
  } catch (error) {
    console.error(error);
    showError(error.message);
    updateProposalCount(0);
    showLoading(false);
  }
}

function applyFiltersAndRender() {
  if (!state.proposalData.length) return;
  const filtered = state.proposalData.filter((proposal) => {
    // Year filter
    const year = (proposal.year || '').trim();
    const activeYears = Object.keys(yearFilters).filter(y => yearFilters[y] === true);
    const totalYears = Object.keys(yearFilters).length;
    const allYearsActive = activeYears.length === totalYears && totalYears > 0;
    
    let yearMatch;
    if (totalYears === 0) {
      // No year filters exist yet, show everything (initial state)
      yearMatch = true;
    } else if (allYearsActive) {
      // All years are active, show everything
      yearMatch = true;
    } else if (activeYears.length === 0) {
      // No years are selected, hide everything
      yearMatch = false;
    } else if (!year) {
      // No year specified, hide it
      yearMatch = false;
    } else {
      // Check if this specific year is active
      yearMatch = yearFilters.hasOwnProperty(year) && yearFilters[year] === true;
    }
    
    // Search filter
    let searchMatch = true;
    if (state.searchQuery) {
      const query = state.searchQuery;
      const searchableText = [
        proposal.title || '',
        proposal.name || '',
        proposal.category || '',
        proposal.description || '',
        proposal.summary || '',
        proposal.tags || '',
        proposal.materials || '',
        proposal.team || '',
      ]
        .join(' ')
        .toLowerCase();
      searchMatch = searchableText.includes(query);
    }
    
    return yearMatch && searchMatch;
  });

  state.filteredList = sortProposals(filtered);
  updateProposalCount(state.filteredList.length, state.proposalData.length);
  renderProposals();
}

function sortProposals(list) {
  const copy = [...list];
  if (state.sortMode === 'title-asc') {
    return copy.sort((a, b) => a.titleLower.localeCompare(b.titleLower));
  }
  if (state.sortMode === 'title-desc') {
    return copy.sort((a, b) => b.titleLower.localeCompare(a.titleLower));
  }
  if (state.sortMode === 'year-asc') {
    return copy.sort((a, b) => {
      const yearA = parseInt(a.year) || 0;
      const yearB = parseInt(b.year) || 0;
      if (yearA !== yearB) return yearA - yearB;
      return a.titleLower.localeCompare(b.titleLower);
    });
  }
  if (state.sortMode === 'year-desc') {
    return copy.sort((a, b) => {
      const yearA = parseInt(a.year) || 0;
      const yearB = parseInt(b.year) || 0;
      if (yearA !== yearB) return yearB - yearA;
      return a.titleLower.localeCompare(b.titleLower);
    });
  }
  if (state.sortMode === 'category') {
    return copy.sort((a, b) => {
      const categoryA = (a.category || '').toLowerCase();
      const categoryB = (b.category || '').toLowerCase();
      if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
      return a.titleLower.localeCompare(b.titleLower);
    });
  }
  // Default: sort by year descending, then by category
  return copy.sort((a, b) => {
    const yearA = parseInt(a.year) || 0;
    const yearB = parseInt(b.year) || 0;
    if (yearA !== yearB) return yearB - yearA; // Descending
    const categoryA = (a.category || '').toLowerCase();
    const categoryB = (b.category || '').toLowerCase();
    if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
    return a.titleLower.localeCompare(b.titleLower);
  });
}

function renderProposals() {
  const list = state.filteredList;

  // Ensure cards exist in the DOM
  const needsRebuild = cardElements.size === 0;
  const hasCardsInDom = proposalsContainer.querySelector('.proposal-card');

  if (needsRebuild) {
    proposalsContainer.innerHTML = '';
    state.proposalData.forEach((proposal) => {
      const card = createProposalCard(proposal);
      card.classList.add('card-clickable');
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'link');
      card.setAttribute('aria-label', proposal.title);
      card.dataset.slug = proposal.slug;
      card.dataset.uniqueKey = proposal.uniqueKey;
      card.addEventListener('click', () => openProposalPage(proposal));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openProposalPage(proposal);
        }
      });
      proposalsContainer.appendChild(card);
      cardElements.set(proposal.uniqueKey, card);
    });
    
    if (isInitialLoad) {
      proposalsContainer.classList.add('cards-loaded');
      showLoading(false);
      isInitialLoad = false;
    }
  } else if (!hasCardsInDom) {
    // Re-attach existing cards in data order
    proposalsContainer.innerHTML = '';
    state.proposalData.forEach((proposal) => {
      const card = cardElements.get(proposal.uniqueKey);
      if (card) {
        proposalsContainer.appendChild(card);
      }
    });
  }

  // Reorder and toggle visibility based on filtered/sorted list
  const visibleUniqueKeys = new Set(list.map(p => p.uniqueKey));
  let visibleCount = 0;

  // Reorder DOM to match sorted list
  list.forEach((proposal) => {
    const card = cardElements.get(proposal.uniqueKey);
    if (card) {
      proposalsContainer.appendChild(card);
      card.style.display = '';
      visibleCount++;
    }
  });

  // Hide cards not in filtered list
  cardElements.forEach((card, uniqueKey) => {
    if (!visibleUniqueKeys.has(uniqueKey)) {
      card.style.display = 'none';
    }
  });

  proposalsContainer.classList.toggle('single', visibleCount === 1);

  if (visibleCount === 0) {
    if (!proposalsContainer.querySelector('.empty')) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty';
      emptyDiv.textContent = 'No proposals match the selected filters.';
      proposalsContainer.appendChild(emptyDiv);
    }
  } else {
    const emptyDiv = proposalsContainer.querySelector('.empty');
    if (emptyDiv) {
      emptyDiv.remove();
    }
  }
  
  // Hide loading when cards are ready
  if (proposalsContainer.classList.contains('cards-loaded')) {
    showLoading(false);
  }
}

function buildDetailSections(proposal) {
  const sections = [
    { label: 'Summary', value: proposal.summary },
    { label: 'Team', value: proposal.team },
    { label: 'Tags', value: proposal.tags },
    { label: 'Experience & Interaction', value: proposal.experienceInteraction, dividerAfter: true },
    { label: 'Scale & Footprint', value: proposal.scaleFootprint },
    { label: 'Materials', value: proposal.materials },
    { label: 'Engineering & Structure', value: proposal.engineering },
    { label: 'Build, Transport & Strike', value: proposal.buildTransportStrike },
    { label: 'Placement Preferences', value: proposal.placementPreferences },
    { label: 'Technology', value: proposal.technology },
    { label: 'Power', value: proposal.power },
    { label: 'Sound', value: proposal.sound },
    { label: 'Safety & Risk Management', value: proposal.safety },
    { label: 'Grant Request', value: proposal.grantRequest ? `\u20ac${proposal.grantRequest}` : '', dividerBefore: true },
    { label: 'Other Funding', value: proposal.otherFunding },
    { label: 'Comments', value: proposal.comments },
  ];

  return sections
    .filter((section) => section.value)
    .map(
      (section) => `
        ${section.dividerBefore ? '<hr>' : ''}
        <div class="detail-section">
          <h3>${section.label}</h3>
          <p>${formatText(section.value)}</p>
        </div>
        ${section.dividerAfter ? '<hr>' : ''}
      `
    )
    .join('');
}

function createProposalCard(
  proposal,
  { showAllDetails = false, showHeader = true } = {}
) {
  const card = document.createElement('article');
  card.className = 'proposal-card';
  if (showAllDetails) {
    card.classList.add('modal-view');
  }

  const detailSections = buildDetailSections(proposal);
  const detailsHTML = showAllDetails && detailSections ? `
        <div class="details-content">
            ${detailSections}
        </div>
    ` : '';

  card.dataset.slug = proposal.slug;

  const authorMarkup = !showAllDetails && showHeader ? formatAuthor(proposal) : '';
  const categoryHTML = proposal.category ? `<span class="category-badge">${escapeHtml(proposal.category)}</span>` : '';
  const headerHTML = showHeader
    ? `
        <header>
            <div class="title-row">
                <h2>${escapeHtml(proposal.title)}</h2>
                <div class="title-row-right">
                    ${categoryHTML}
                </div>
            </div>
            ${authorMarkup}
        </header>
    `
    : '';

  const imageHTML = proposal.coverImage
    ? `<img class="cover-image" src="${proposal.coverImage}" alt="${escapeHtml(proposal.title)}" loading="lazy" decoding="async">`
    : '';

  const galleryHTML = proposal.images && proposal.images.length > 1
    ? `<div class="detail-gallery">${proposal.images.map((url, i) =>
        `<img class="gallery-image" src="${url}" alt="${escapeHtml(proposal.title)} ${i + 1}" loading="lazy" decoding="async">`
      ).join('')}</div>`
    : '';

  if (showAllDetails) {
    const detailImageHTML = proposal.images && proposal.images.length > 1
      ? galleryHTML
      : (imageHTML ? `<div class="detail-image">${imageHTML}</div>` : '');

    card.innerHTML = `
        <div class="detail-layout">
            ${detailImageHTML}
            <div class="detail-text">
                ${headerHTML}
                <div class="card-body">
                    <div class="detail-section">
                        <h3>Concept</h3>
                        <div class="summary">${formatText(proposal.description || 'No description provided.')}</div>
                    </div>
                    ${detailsHTML}
                </div>
                            </div>
        </div>
    `;
  } else {
    card.innerHTML = `
        <div class="card-content">
            ${headerHTML}
            <div class="card-body">
                <div class="summary">${formatText(proposal.description || 'No description provided.')}</div>
            </div>
                    </div>
        ${imageHTML ? `<div class="card-thumb">${imageHTML}</div>` : ''}
    `;
  }

  return card;
}

function formatAuthor(proposal) {
  const displayName = getDisplayName(proposal);
  if (!displayName) return '';
  const year = proposal.year ? `, ${proposal.year}` : '';
  return `<div class="author">${escapeHtml(displayName + year)}</div>`;
}

function openProposalPage(proposal, { skipPushState = false } = {}) {
  // Hide listing UI and hero, switch to neutral bg
  const layout = document.querySelector('.layout');
  layout.style.display = 'none';
  const heroHeader = document.querySelector('.hero-header');
  if (heroHeader) heroHeader.style.display = 'none';
  document.body.classList.add('project-view');

  // Build project page
  const page = document.createElement('div');
  page.className = 'project-page';

  const header = document.createElement('header');
  header.className = 'project-header';

  const backLink = document.createElement('a');
  backLink.className = 'back-link';
  backLink.href = baseUrl();
  backLink.textContent = '← Art Grants';
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    closeProjectPage(page);
  });

  const titleEl = document.createElement('h1');
  titleEl.className = 'project-title';
  titleEl.textContent = proposal.title || 'Untitled Proposal';

  const meta = document.createElement('div');
  meta.className = 'project-meta';
  const displayName = getDisplayName(proposal);
  const parts = [];
  if (displayName) parts.push(escapeHtml(displayName));
  if (proposal.year) parts.push(escapeHtml(proposal.year));
  if (proposal.category) parts.push(`<span class="category-badge">${escapeHtml(proposal.category)}</span>`);
  meta.innerHTML = parts.join(' · ');

  // Next project link
  const currentIndex = state.filteredList.findIndex(p => p.uniqueKey === proposal.uniqueKey);
  const nextProposal = currentIndex !== -1 ? state.filteredList[(currentIndex + 1) % state.filteredList.length] : null;

  const headerTop = document.createElement('div');
  headerTop.className = 'project-header-top';
  headerTop.appendChild(backLink);
  if (nextProposal && nextProposal.uniqueKey !== proposal.uniqueKey) {
    const nextLink = document.createElement('a');
    nextLink.className = 'next-link';
    nextLink.href = proposalUrl(nextProposal);
    nextLink.textContent = 'Next →';
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      page.remove();
      state.currentProjectPage = null;
      openProposalPage(nextProposal);
    });
    headerTop.appendChild(nextLink);
  }

  header.append(headerTop, titleEl, meta);

  const card = createProposalCard(proposal, {
    showAllDetails: true,
    showHeader: false,
  });
  card.classList.add('project-card');

  // Tab navigation
  const hasChat = proposal.messagingOn;
  if (hasChat) {
    const tabNav = document.createElement('nav');
    tabNav.className = 'project-tabs';

    const projectTab = document.createElement('button');
    projectTab.className = 'project-tab is-active';
    projectTab.textContent = 'Project';

    const chatTab = document.createElement('button');
    chatTab.className = 'project-tab';
    chatTab.textContent = 'Discussion';

    tabNav.append(projectTab, chatTab);

    const projectPanel = document.createElement('div');
    projectPanel.className = 'project-body tab-panel';
    projectPanel.appendChild(card);

    const chatPanel = document.createElement('div');
    chatPanel.className = 'project-body tab-panel';
    chatPanel.style.display = 'none';
    chatPanel.appendChild(createChatSection(proposal));

    projectTab.addEventListener('click', () => {
      projectTab.classList.add('is-active');
      chatTab.classList.remove('is-active');
      projectPanel.style.display = '';
      chatPanel.style.display = 'none';
    });

    chatTab.addEventListener('click', () => {
      chatTab.classList.add('is-active');
      projectTab.classList.remove('is-active');
      chatPanel.style.display = '';
      projectPanel.style.display = 'none';
    });

    page.append(header, tabNav, projectPanel, chatPanel);
  } else {
    const body = document.createElement('div');
    body.className = 'project-body';
    body.appendChild(card);
    page.append(header, body);
  }
  document.querySelector('.page-wrap').appendChild(page);

  // Update URL and title only when navigating forward (not on popstate)
  document.title = `${proposal.title} — ${BASE_TITLE}`;
  if (!skipPushState) {
    window.history.pushState(null, '', proposalUrl(proposal));
  }
  window.scrollTo(0, 0);

  state.currentProjectPage = page;
}

function closeProjectPage(page) {
  if (page && page.parentNode) {
    page.remove();
  }
  const layout = document.querySelector('.layout');
  layout.style.display = '';
  const heroHeader = document.querySelector('.hero-header');
  if (heroHeader) heroHeader.style.display = '';
  document.body.classList.remove('project-view');
  state.currentProjectPage = null;

  document.title = BASE_TITLE;
  window.history.pushState(null, '', baseUrl());
}

function showLoading(isLoading) {
  if (loadingEl) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
  }
}

function showError(message) {
  if (loadingEl) loadingEl.style.display = 'none';
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

function updateProposalCount(visibleCount, totalCount) {
  if (!proposalCountEl) return;
  const safeVisible = typeof visibleCount === 'number' ? visibleCount : 0;
  const safeTotal = typeof totalCount === 'number' ? totalCount : 0;
  proposalCountEl.textContent = `${safeVisible}/${safeTotal}`;
}

