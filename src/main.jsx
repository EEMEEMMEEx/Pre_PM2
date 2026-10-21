import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { APP_VERSION } from './version.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Register Service Worker for offline PWA operation
if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
  window.addEventListener('load', () => {
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    const swUrl = `${basePath}/sw.js?v=${APP_VERSION}`;
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

