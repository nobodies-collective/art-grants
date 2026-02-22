import { CSV_URL } from './constants.js';
import { initUI } from './ui.js';

// Start fetching data immediately (don't wait for DOM)
const prefetch = fetch(CSV_URL).then(r => r.ok ? r.text() : Promise.reject(r.status));

// Expose the prefetched promise so ui.js can use it
export { prefetch };

document.addEventListener('DOMContentLoaded', initUI);

