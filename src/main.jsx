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
    // ใช้ BASE_URL เพื่อให้ SW อยู่ใต้ subpath ของ GitHub Pages (/<repo>/) ด้วย
    // ถ้าใช้ '/sw.js' ตรง ๆ scope จะหลุดไป domain root -> 404 บน Pages
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?v=${APP_VERSION}`)
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

