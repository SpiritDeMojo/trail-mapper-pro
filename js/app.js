/* ═══════════════════════════════════════════════════════
   Trail Mapper Pro — Main App (Router & State)
   ═══════════════════════════════════════════════════════ */

import { loadWalks, closeDetail } from './library.js';
import { initCreator } from './creator.js';
import { initAIStudio } from './ai-studio.js';
import { initSettings } from './settings.js';

let currentView = 'library';
let creatorInitialised = false;
let aiInitialised = false;
let settingsInitialised = false;

/**
 * Switch between views
 */
function switchView(view) {
    if (view === currentView && view !== 'library') return;
    currentView = view;

    // Close detail if open
    if (view !== 'detail') {
        closeDetail();
    }

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${view}`);
    if (target) target.classList.add('active');

    // Lazy-init views
    if (view === 'creator' && !creatorInitialised) {
        setTimeout(() => {
            initCreator();
            creatorInitialised = true;
        }, 100);
    }

    if (view === 'ai-studio' && !aiInitialised) {
        setTimeout(() => {
            initAIStudio();
            aiInitialised = true;
        }, 100);
    }

    if (view === 'settings' && !settingsInitialised) {
        initSettings();
        settingsInitialised = true;
    }
}

/**
 * Bootstrap
 */
function init() {
    // Load walks
    loadWalks();

    // Nav clicks
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Back button from detail
    document.getElementById('back-btn').addEventListener('click', () => {
        switchView('library');
    });

    // Escape key closes detail
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const detail = document.getElementById('view-detail');
            if (detail.classList.contains('active')) {
                switchView('library');
            }
        }
    });

    console.log('🥾 Trail Mapper Pro initialised');
}

// Go
init();
