import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the normalized application base path from Vite env (e.g., '/Pre_PM2/' or '/')
 */
export function getAppBasePath() {
  const base = (import.meta.env?.BASE_URL || '/').trim();
  if (!base.startsWith('/')) return `/${base}`;
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Parses the current or provided pathname relative to base path into a known app page ('dashboard' | 'field' | 'login')
 */
export function getAppRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  const base = getAppBasePath();
  let normalized = pathname;
  if (base !== '/' && normalized.startsWith(base)) {
    normalized = normalized.slice(base.length - 1); // keep leading '/'
  } else if (base !== '/' && normalized === base.slice(0, -1)) {
    normalized = '/';
  } else if (normalized.startsWith('/Pre_PM2/')) {
    normalized = normalized.slice('/Pre_PM2'.length);
  } else if (normalized === '/Pre_PM2') {
    normalized = '/';
  }
  
  const clean = normalized.replace(/\/+$/, '') || '/';
  if (clean === '/dashboard') return 'dashboard';
  if (clean === '/login') return 'login';
  return 'field';
}

/**
 * Formats a target page into a full browser URL including base path
 */
export function getAppUrl(page) {
  const base = getAppBasePath().replace(/\/+$/, '');
  if (page === 'dashboard') return `${base}/dashboard`;
  if (page === 'login') return `${base}/login`;
  return `${base}/` || '/';
}

