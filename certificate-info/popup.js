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

function $(id) { return document.getElementById(id); }

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value == null ? '' : String(value);
}

function show(id, visible) {
  const el = $(id);
  if (el) el.hidden = !visible;
}

// Map the server's short code (DV/IV/EV/!) to localized strings. Returns ''
// when no translation key applies so callers can fall back to server text.
const VALIDATION_KEY_BY_SHORT = {
  DV: { title: 'validationDV', message: 'validationDVMessage' },
  IV: { title: 'validationIV', message: 'validationIVMessage' },
  EV: { title: 'validationEV', message: 'validationEVMessage' },
  '!': { title: 'validationNone', message: 'validationNoneMessage' }
};

function localizedValidation(data) {
  const keys = VALIDATION_KEY_BY_SHORT[data && data.validation_result_short];
  return keys ? chrome.i18n.getMessage(keys.title) : '';
}

function localizedMessage(data) {
  const keys = VALIDATION_KEY_BY_SHORT[data && data.validation_result_short];
  return keys ? chrome.i18n.getMessage(keys.message) : '';
}

async function getPopupData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  const key = `popup:${tab.id}`;
  const store = await chrome.storage.session.get(key);
  return store[key] || null;
}

function formatExpiration(data) {
  if (!data.not_after) {
    setText('expirationDate', chrome.i18n.getMessage('expirationUnknown'));
    $('expirationDate').classList.add('is-error');
    show('expirationMessage', false);
    return;
  }

  const notAfter = new Date(data.not_after);
  const dateEl = $('expirationDate');
  dateEl.textContent = notAfter.toLocaleDateString();
  dateEl.title = notAfter.toString();

  const days = data.expiration_days_until;
  const msgEl = $('expirationMessage');
  msgEl.classList.remove('is-error', 'is-warning', 'is-ok');

  if (days <= 0) {
    msgEl.textContent = chrome.i18n.getMessage('expirationExpired');
    msgEl.classList.add('is-error');
  } else {
    const key = days === 1 ? 'expirationInDay' : 'expirationInDays';
    msgEl.textContent = chrome.i18n.getMessage(key, [String(days)]);
    if (data.expiration_class === 'ExpirationError') {
      msgEl.classList.add('is-error');
    } else if (data.expiration_class === 'ExpirationWarning') {
      msgEl.classList.add('is-warning');
    } else if (data.expiration_class === 'ExpirationOk') {
      msgEl.classList.add('is-ok');
    }
  }
  show('expirationMessage', true);
}

function render(data) {
  if (!data) {
    setText('validationResult', chrome.i18n.getMessage('popupNoPage'));
    setText('message', chrome.i18n.getMessage('popupIntro'));
    show('identitySection', false);
    show('issuerSection', false);
    show('expirationSection', false);
    return;
  }

  const resultEl = $('validationResult');
  resultEl.textContent = localizedValidation(data) || data.validation_result || '';
  if (data.result_color_hex) {
    resultEl.style.background = data.result_color_hex;
  }

  setText('message', localizedMessage(data) || data.message || '');

  // Identity
  if (data.subject_organization) {
    setText('subjectOrganization', data.subject_organization);
    show('identitySection', true);
  } else {
    show('identitySection', false);
  }

  // Issuer
  if (data.issuer_common_name) {
    setText('issuerOrganization', data.issuer_organization || '');
    setText('issuerCommonName', data.issuer_common_name);
    show('issuerSection', true);
  } else {
    show('issuerSection', false);
  }

  // Expiration
  if (typeof data.not_after === 'string') {
    show('expirationSection', true);
    formatExpiration(data);
  } else {
    show('expirationSection', false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Localize static labels.
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  document.documentElement.lang = chrome.i18n.getUILanguage();

  const data = await getPopupData();
  render(data);
});
