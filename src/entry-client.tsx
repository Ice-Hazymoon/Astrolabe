import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import i18n from './i18n';
import { maybeAutoRedirect } from './i18n/autoRedirect';
import './styles/global.css';

// Route first-time visitors to their preferred locale before React hydrates.
// If a redirect is issued we skip bootstrap entirely — otherwise the default
// language would flash in for a frame before navigation.
if (!maybeAutoRedirect()) {
  bootstrap();
}

function bootstrap() {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('[PWA] offline shell ready');
    },
    onRegisterError(error) {
      console.error('[PWA] service worker registration failed', error);
    },
  });

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
   * When the build-time prerender has injected static HTML into `#root`,
   * hydrate it so crawlers and users see identical markup before and after JS.
   * On pure SPA dev builds the root is empty — fall back to `createRoot`.
   */
  const hasSsrContent =
    rootEl.firstElementChild != null || (rootEl.textContent ?? '').trim().length > 0;

  if (hasSsrContent) {
    hydrateRoot(rootEl, tree);
  } else {
    rootEl.innerHTML = '';
    createRoot(rootEl).render(tree);
  }
}
