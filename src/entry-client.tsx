import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import i18n from './i18n';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const tree = (
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>
);

/**
 * Bootstrap: when the build-time prerender has injected static HTML into
 * `#root`, hydrate it so crawlers and users see identical markup before and
 * after JS. On pure SPA dev builds the root is empty (only the loader
 * placeholder / comment) — fall back to `createRoot`.
 */
const hasSsrContent =
  rootEl.firstElementChild != null ||
  (rootEl.textContent ?? '').trim().length > 0;

if (hasSsrContent) {
  hydrateRoot(rootEl, tree);
} else {
  rootEl.innerHTML = '';
  createRoot(rootEl).render(tree);
}
