// certificate-info — central configuration
//
// Edit this file to point the extension at a different validation backend.
// Also remember to update "host_permissions" in manifest.json so Chrome
// actually allows the request.

// eslint-disable-next-line no-unused-vars
const CERT_INFO_CONFIG = Object.freeze({
  // Base URL of the validation backend.
  // Examples:
  //   production : 'https://api.blupig.net/certificate-info'
  //   self-hosted: 'https://cert.example.com'
  //   local dev  : 'http://localhost:8000'
  API_BASE_URL: 'https://api.blupig.net/certificate-info',

  // Path appended to API_BASE_URL for validation requests.
  VALIDATE_PATH: '/validate',

  // Network / cache tunables.
  FETCH_TIMEOUT_MS: 10 * 1000,
  CACHE_TTL_MS: 5 * 60 * 1000,

  // Expiration thresholds (days).
  EXPIRATION_ERROR_DAYS: 14,
  EXPIRATION_WARN_DAYS: 29
});

if (typeof self !== 'undefined') {
  // Service worker (importScripts) + window (script tag) both hit this branch.
  self.CERT_INFO_CONFIG = CERT_INFO_CONFIG;
}
