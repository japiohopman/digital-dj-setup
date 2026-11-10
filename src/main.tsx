import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { registerAppServiceWorker } from './pwa/registerServiceWorker';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The app root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) {
  registerAppServiceWorker(
    'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    (onLoad) => window.addEventListener('load', onLoad, { once: true }),
    import.meta.env.BASE_URL,
  );
}
