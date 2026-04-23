// certificate-info
// Copyright (C) 2017-2018 Yunzhu Li
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

'use strict';

// Load shared configuration (API endpoint, timeouts, etc.).
// This must be the first statement so constants below are defined.
// eslint-disable-next-line no-undef
importScripts('config.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_ENDPOINT = CERT_INFO_CONFIG.API_BASE_URL + CERT_INFO_CONFIG.VALIDATE_PATH;
const CACHE_TTL_MS = CERT_INFO_CONFIG.CACHE_TTL_MS;
const FETCH_TIMEOUT_MS = CERT_INFO_CONFIG.FETCH_TIMEOUT_MS;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_ERROR_DAYS = CERT_INFO_CONFIG.EXPIRATION_ERROR_DAYS;
const EXPIRATION_WARN_DAYS = CERT_INFO_CONFIG.EXPIRATION_WARN_DAYS;

const COLOR = {
  gray:   '#888',
  red:    '#FF1744',
  orange: '#EF6C00'
};

// ---------------------------------------------------------------------------
// In-memory validation cache (hostname -> { data, expiresAt })
// Service workers can be terminated; cache is best-effort.
// ---------------------------------------------------------------------------
const validationCache = new Map();

function cacheGet(hostname) {
  const entry = validationCache.get(hostname);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    validationCache.delete(hostname);
    return null;
  }
  return entry.data;
}

function cacheSet(hostname, data) {
  validationCache.set(hostname, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Popup state storage (per tab). Persisted via chrome.storage.session so the
// popup can render after the service worker is suspended.
// ---------------------------------------------------------------------------
function popupKey(tabId) {
  return `popup:${tabId}`;
}

async function setPopupState(tabId, state) {
  await chrome.storage.session.set({ [popupKey(tabId)]: state });
}

async function clearPopupState(tabId) {
  await chrome.storage.session.remove(popupKey(tabId));
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function fetchCertInfo(hostname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'GET',
      headers: { 'x-validate-host': hostname },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Expiration annotation
// ---------------------------------------------------------------------------
function annotateExpiration(data) {
  let daysUntil = 0;
  let expirationClass = '';

  if (data && data.not_after) {
    const notAfter = new Date(data.not_after);
    if (!Number.isNaN(notAfter.getTime())) {
      daysUntil = Math.floor((notAfter.getTime() - Date.now()) / ONE_DAY_MS);
      if (daysUntil <= EXPIRATION_ERROR_DAYS) {
        expirationClass = 'ExpirationError';
      } else if (daysUntil <= EXPIRATION_WARN_DAYS) {
        expirationClass = 'ExpirationWarning';
      } else {
        expirationClass = 'ExpirationOk';
      }
    }
  }

  return { ...data, expiration_days_until: daysUntil, expiration_class: expirationClass };
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------
async function setBadge(tabId, color, text) {
  try {
    if (color) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
    }
    await chrome.action.setBadgeText({ tabId, text });
  } catch (_) {
    // Tab may have closed.
  }
}

async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Rendering: map validation result → badge + popup state
// ---------------------------------------------------------------------------
async function renderLoading(tabId) {
  await setBadge(tabId, COLOR.gray, '...');
  await setPopupState(tabId, {
    result_color_hex: COLOR.gray,
    validation_result: chrome.i18n.getMessage('popupLoading'),
    message: chrome.i18n.getMessage('popupLoadingMessage'),
    subject_organization: '',
    issuer_common_name: '',
    issuer_organization: '',
    not_after: '',
    expiration_days_until: 0,
    expiration_class: ''
  });
}

async function renderHttp(tabId) {
  await setBadge(tabId, COLOR.orange, 'i');
  await setPopupState(tabId, {
    result_color_hex: COLOR.orange,
    validation_result: chrome.i18n.getMessage('popupHttp'),
    message: chrome.i18n.getMessage('popupHttpMessage'),
    subject_organization: '',
    issuer_common_name: '',
    issuer_organization: '',
    not_after: '',
    expiration_days_until: 0,
    expiration_class: ''
  });
}

async function renderError(tabId) {
  await setBadge(tabId, COLOR.red, '!');
  await setPopupState(tabId, {
    result_color_hex: COLOR.red,
    validation_result: chrome.i18n.getMessage('popupFetchError'),
    message: chrome.i18n.getMessage('popupFetchErrorMessage'),
    subject_organization: '',
    issuer_common_name: '',
    issuer_organization: '',
    not_after: '',
    expiration_days_until: 0,
    expiration_class: ''
  });
}

async function renderValidation(tabId, data) {
  const annotated = annotateExpiration(data);
  await setPopupState(tabId, annotated);

  if (annotated.expiration_class === 'ExpirationError') {
    await setBadge(tabId, COLOR.red, '⏱');
  } else if (annotated.expiration_class === 'ExpirationWarning') {
    await setBadge(tabId, COLOR.orange, '⏱');
  } else {
    await setBadge(tabId, annotated.result_color_hex, annotated.validation_result_short || '');
  }
}

async function renderNone(tabId) {
  await clearBadge(tabId);
  await clearPopupState(tabId);
}

// ---------------------------------------------------------------------------
// Tab update pipeline
// ---------------------------------------------------------------------------
function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch (_) {
    return null;
  }
}

async function updateTab(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  const parsed = parseUrl(tab.url);
  if (!parsed) {
    await renderNone(tab.id);
    return;
  }

  if (parsed.protocol === 'http:') {
    await renderHttp(tab.id);
    return;
  }

  if (parsed.protocol !== 'https:') {
    await renderNone(tab.id);
    return;
  }

  const hostname = parsed.hostname;
  const cached = cacheGet(hostname);
  if (cached) {
    await renderValidation(tab.id, cached);
    return;
  }

  await renderLoading(tab.id);
  const data = await fetchCertInfo(hostname);
  if (!data) {
    await renderError(tab.id);
    return;
  }
  cacheSet(hostname, data);
  await renderValidation(tab.id, data);
}

async function updateAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(updateTab));
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => { updateAllTabs(); });
chrome.runtime.onStartup.addListener(() => { updateAllTabs(); });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.title === 'Privacy error') {
    updateTab(tab);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => { clearPopupState(tabId); });
