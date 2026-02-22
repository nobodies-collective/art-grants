import { statusFilters, yearFilters, state } from './state.js';
import { fetchSpreadsheetData, mapRowToProposal } from './data.js';
import { escapeHtml, formatText, getDisplayName } from './utils.js';
import { createChatSection } from './chat.js';

let proposalsContainer;
let loadingEl;
let errorEl;
let sortSelect;
let viewButtons;
let statusButtons;
let proposalCountEl;
let searchInput;
let yearFiltersContainer;
let isInitialLoad = true;
let cardElements = new Map();

// Detect base path so /repo-name/proposal/slug works on GitHub Pages
const BASE_PATH = window.location.pathname.replace(/\/proposal\/.*$/, '').replace(/\/+$/, '');

function getSlugFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/proposal\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

function proposalUrl(slug) {
  return `${BASE_PATH}/proposal/${slug}`;
}

function baseUrl() {
  return BASE_PATH || '/';
}

export function initUI() {
  proposalsContainer = document.getElementById('proposals-list');
  loadingEl = document.getElementById('loading');
  errorEl = document.getElementById('error');
  sortSelect = document.getElementById('sort-select');
  viewButtons = [...document.querySelectorAll('.view-button')];
  statusButtons = [...document.querySelectorAll('.status-chip')];
  proposalCountEl = document.getElementById('proposal-count');
  searchInput = document.getElementById('search-input');
  yearFiltersContainer = document.getElementById('year-filters-container');

  attachEventListeners();
  loadData();
}

function attachEventListeners() {
  statusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const status = button.dataset.status;
      statusFilters[status] = !statusFilters[status];
      button.classList.toggle('is-active', statusFilters[status]);
      button.setAttribute('aria-pressed', String(statusFilters[status]));
      applyFiltersAndRender();
    });
  });

  sortSelect.addEventListener('change', (event) => {
    state.sortMode = event.target.value;
    applyFiltersAndRender();
  });

  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view;
      if (nextView === state.viewMode) return;
      state.viewMode = nextView;
      viewButtons.forEach((btn) => {
        const isActive = btn.dataset.view === state.viewMode;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
      });
      renderProposals();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      state.searchQuery = event.target.value.trim().toLowerCase();
      applyFiltersAndRender();
    });
  }

  window.addEventListener('popstate', () => {
    if (state.suppressNavChange) return;
    const slug = getSlugFromPath();
    if (slug) {
      // Close existing project page if open
      if (state.currentProjectPage) {
        state.currentProjectPage.remove();
        state.currentProjectPage = null;
      }
      const proposal = state.proposalData.find((item) => item.slug === slug);
      if (proposal) openProposalPage(proposal);
    } else {
      // Back to listing
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
    const { headers, rows } = await fetchSpreadsheetData();
    if (!rows.length) {
      showError('No proposals available.');
      showLoading(false);
      return;
    }

    state.proposalData = rows.map((row, index) => mapRowToProposal(row, headers, index));
    buildYearFilters();
    updateProposalCount(state.proposalData.length, state.proposalData.length);
    applyFiltersAndRender();
    // Loading will be hidden when cards are ready (handled in renderProposals)

    const initialSlug = getSlugFromPath();
    if (initialSlug) {
      const initialProposal = state.proposalData.find((item) => item.slug === initialSlug);
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
    // Status filter
    const statusMatch = statusFilters[proposal.statusKey] !== false;
    
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
        proposal.technicalDetails || '',
        proposal.spaceRequirements || '',
        proposal.locationRequirements || '',
        proposal.team || '',
      ]
        .join(' ')
        .toLowerCase();
      searchMatch = searchableText.includes(query);
    }
    
    return statusMatch && yearMatch && searchMatch;
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
  if (state.sortMode === 'status') {
    const order = {
      funded: 0,
      'under-review': 1,
      'not-funded': 2,
      'self-funded': 3,
    };
    return copy.sort(
      (a, b) =>
        (order[a.statusClass] ?? 99) - (order[b.statusClass] ?? 99) ||
        a.titleLower.localeCompare(b.titleLower)
    );
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

  if (state.viewMode === 'table') {
    proposalsContainer.innerHTML = '';
    proposalsContainer.classList.remove('single');
    proposalsContainer.appendChild(buildTable(list));
    return;
  }

  // Ensure cards exist in the DOM
  const needsRebuild = cardElements.size === 0;
  const hasCardsInDom = proposalsContainer.querySelector('.proposal-card');

  if (needsRebuild) {
    proposalsContainer.innerHTML = '';
    state.proposalData.forEach((proposal) => {
      const card = createProposalCard(proposal);
      card.classList.add('card-clickable');
      card.dataset.slug = proposal.slug;
      card.dataset.uniqueKey = proposal.uniqueKey;
      if (isInitialLoad) {
        card.classList.add('fade-in-on-load');
      } else {
        card.classList.add('no-animation');
      }
      card.addEventListener('click', () => openProposalPage(proposal));
      proposalsContainer.appendChild(card);
      cardElements.set(proposal.uniqueKey, card);
    });
    
    if (isInitialLoad) {
      // Wait for images to load, then fade in all cards at once
      const images = proposalsContainer.querySelectorAll('img');
      const markLoaded = () => {
        if (!proposalsContainer.classList.contains('cards-loaded')) {
          proposalsContainer.classList.add('cards-loaded');
          showLoading(false);
          isInitialLoad = false;
        }
      };

      // Always set a timeout as fallback
      const fallbackTimeout = setTimeout(() => {
        markLoaded();
      }, 1500);

      if (images.length === 0) {
        // No images, fade in immediately
        clearTimeout(fallbackTimeout);
        setTimeout(markLoaded, 100);
      } else {
        let loadedCount = 0;
        const totalImages = images.length;
        
        const handleDone = () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            clearTimeout(fallbackTimeout);
            markLoaded();
          }
        };

        images.forEach((img) => {
          if (img.complete && img.naturalHeight !== 0) {
            handleDone();
          } else {
            img.addEventListener('load', handleDone, { once: true });
            img.addEventListener('error', handleDone, { once: true });
          }
        });
      }
    } else {
      isInitialLoad = false;
    }
  } else if (!hasCardsInDom) {
    // Re-attach existing cards in data order
    proposalsContainer.innerHTML = '';
    state.proposalData.forEach((proposal) => {
      const card = cardElements.get(proposal.uniqueKey);
      if (card) {
        card.classList.add('no-animation');
        proposalsContainer.appendChild(card);
      }
    });
  }

  // Toggle visibility based on filtered list
  const visibleUniqueKeys = new Set(list.map(p => p.uniqueKey));
  let visibleCount = 0;
  
  cardElements.forEach((card, uniqueKey) => {
    if (visibleUniqueKeys.has(uniqueKey)) {
      card.style.display = '';
      visibleCount++;
    } else {
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
    { label: 'Technical Details', value: proposal.technicalDetails },
    { label: 'Space Requirements', value: proposal.spaceRequirements },
    { label: 'Location Requirements', value: proposal.locationRequirements },
    { label: 'Power Requirements', value: proposal.powerRequirements },
    { label: 'Sound', value: proposal.sound },
    { label: 'Safety', value: proposal.safety },
    { label: 'Strike', value: proposal.strike },
    { label: 'Co-creation', value: proposal.coCreation },
    { label: 'Team', value: proposal.team },
  ];

  return sections
    .filter((section) => section.value)
    .map(
      (section) => `
        <div class="detail-section">
          <h3>${section.label}</h3>
          <p>${formatText(section.value)}</p>
        </div>
      `
    )
    .join('');
}

function createProposalCard(
  proposal,
  { showAllDetails = false, showStatusText = false, showHeader = true } = {}
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

  card.dataset.status = proposal.statusClass;
  card.dataset.slug = proposal.slug;
  const statusHTML = showStatusText
    ? `<span class="status ${proposal.statusClass}">${escapeHtml(proposal.statusLabel)}</span>`
    : '';
  const cardStatusHTML = showStatusText
    ? `<div class="card-status"><span class="status ${proposal.statusClass}">${escapeHtml(
        proposal.statusLabel
      )}</span></div>`
    : '';

  const authorMarkup = !showAllDetails && showHeader ? formatAuthor(proposal) : '';
  const categoryHTML = proposal.category ? `<span class="category-badge">${escapeHtml(proposal.category)}</span>` : '';
  const headerHTML = showHeader
    ? `
        <header>
            <div class="title-row">
                <h2>${escapeHtml(proposal.title)}</h2>
                <div class="title-row-right">
                    ${categoryHTML}
                    ${statusHTML}
                </div>
            </div>
            ${authorMarkup}
        </header>
    `
    : '';

  card.innerHTML = `
        ${headerHTML}
        <main>
            ${proposal.coverImage ? `<img class="cover-image" src="${proposal.coverImage}" alt="${escapeHtml(proposal.title)}" loading="lazy">` : ''}
            <div class="summary">${formatText(proposal.description || 'No description provided.')}</div>
            ${detailsHTML}
        </main>
        ${cardStatusHTML}
    `;

  return card;
}

function buildTable(list) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-shell';

  const table = document.createElement('table');
  table.className = 'proposal-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
        <tr>
            <th>Title</th>
            <th>Year</th>
            <th>Category</th>
            <th>Description</th>
            <th>Status</th>
        </tr>
    `;

  const tbody = document.createElement('tbody');
  list.forEach((proposal) => {
    const tr = document.createElement('tr');
    tr.classList.add('table-row-clickable');

    const titleTd = document.createElement('td');
    titleTd.textContent = proposal.title;

    const yearTd = document.createElement('td');
    yearTd.textContent = proposal.year || '—';

    const categoryTd = document.createElement('td');
    categoryTd.textContent = proposal.category || '—';

    const descriptionTd = document.createElement('td');
    descriptionTd.className = 'description-cell';
    const summaryText = (proposal.description || '').replace(/\s+/g, ' ').trim();
    descriptionTd.textContent = summaryText || '—';
    if (summaryText) {
      descriptionTd.title = summaryText;
    }

    const statusTd = document.createElement('td');
    statusTd.innerHTML = `<span class="status ${proposal.statusClass}">${escapeHtml(
      proposal.statusLabel
    )}</span>`;

    tr.append(titleTd, yearTd, categoryTd, descriptionTd, statusTd);
    tr.addEventListener('click', () => openProposalPage(proposal));
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function formatAuthor(proposal) {
  const displayName = getDisplayName(proposal);
  if (!displayName) return '';
  const year = proposal.year ? `, ${proposal.year}` : '';
  return `<div class="author">${escapeHtml(displayName + year)}</div>`;
}

function openProposalPage(proposal) {
  // Hide listing UI
  const layout = document.querySelector('.layout');
  layout.style.display = 'none';

  // Build project page
  const page = document.createElement('div');
  page.className = 'project-page';
  page.dataset.status = proposal.statusClass;

  const header = document.createElement('header');
  header.className = 'project-header';

  const backBtn = document.createElement('a');
  backBtn.className = 'project-back';
  backBtn.href = baseUrl();
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', (e) => {
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
  parts.push(`<span class="status ${proposal.statusClass}">${escapeHtml(proposal.statusLabel)}</span>`);
  meta.innerHTML = parts.join(' · ');

  header.append(backBtn, titleEl, meta);

  const card = createProposalCard(proposal, {
    showAllDetails: true,
    showStatusText: false,
    showHeader: false,
  });
  card.classList.add('project-card');

  page.append(header, card, createChatSection(proposal));
  document.querySelector('.page-wrap').appendChild(page);

  // Update URL
  state.suppressNavChange = true;
  window.history.pushState(null, '', proposalUrl(proposal.slug));
  setTimeout(() => { state.suppressNavChange = false; }, 0);
  window.scrollTo(0, 0);

  state.currentProjectPage = page;
}

function closeProjectPage(page) {
  if (page && page.parentNode) {
    page.remove();
  }
  const layout = document.querySelector('.layout');
  layout.style.display = '';
  state.currentProjectPage = null;

  state.suppressNavChange = true;
  window.history.pushState(null, '', baseUrl());
  setTimeout(() => { state.suppressNavChange = false; }, 0);
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

