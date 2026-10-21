import React, { useState, useEffect } from 'react';
import { Spotlight } from '@/components/ui/spotlight';
import { ToastHost } from '@/components/ui/toast';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { FieldVisitView } from '@/components/field/FieldVisitView';
import { LoginView } from '@/components/auth/LoginView';
import { useTheme } from '@/context/ThemeContext';
import { isStaticHost, saveLocalApiToken } from '@/lib/api';
import { cn, getAppRoute, getAppUrl } from '@/lib/utils';

export function App() {
  const { isDark } = useTheme();
  const [currentPage, setCurrentPage] = useState(() => {
    const route = getAppRoute();
    if (route === 'login' && isStaticHost()) return 'field';
    return route;
  });

  const [editingSurvey, setEditingSurvey] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthGateActive, setIsAuthGateActive] = useState(false);

  const navigateTo = (page, extra = null) => {
    setMobileMenuOpen(false);
    if (page === 'field') {
      setEditingSurvey(extra || null);
    } else {
      setEditingSurvey(null);
    }
    setCurrentPage(page);
    const targetUrl = getAppUrl(page);
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, '', targetUrl);
    }
  };

  // Sync state with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setMobileMenuOpen(false);
      setEditingSurvey(null);
      const route = getAppRoute();
      if (route === 'login' && isStaticHost()) {
        setCurrentPage('field');
      } else {
        setCurrentPage(route);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect to home if browsing to login route on static host (no local server backend)
  useEffect(() => {
    if (getAppRoute() === 'login' && isStaticHost()) {
      window.history.replaceState({}, '', getAppUrl('field'));
      setEditingSurvey(null);
      setCurrentPage('field');
    }
  }, []);

  // Listen to local server auth gate triggers (Task C1 & C2)
  useEffect(() => {
    const handleLocalAuthRequired = () => {
      if (!isStaticHost()) {
        setIsAuthGateActive(true);
      }
    };
    window.addEventListener('nbtc-local-auth-required', handleLocalAuthRequired);
    return () => window.removeEventListener('nbtc-local-auth-required', handleLocalAuthRequired);
  }, []);

  return (
    <div
      className={cn(
        'relative min-h-screen transition-colors duration-300',
        isDark
          ? 'bg-[radial-gradient(ellipse_at_top_right,rgba(8,105,255,0.18),transparent_60%),linear-gradient(135deg,#020b1b,#031a3a_48%,#020f25)] text-slate-100'
          : 'bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.12),transparent_60%),linear-gradient(135deg,#f8fafc,#edf2f7_48%,#e2e8f0)] text-slate-900'
      )}
    >
      <Spotlight />

      {/* Top Fixed Navbar */}
      <Navbar
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        isMobileMenuOpen={mobileMenuOpen}
      />

      <div className="flex">
        {/* Left Fixed Sidebar */}
        <Sidebar
          currentPage={currentPage}
          onNavigate={navigateTo}
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />

        {/* Dynamic Page Content */}
        <div className="flex-1 min-w-0 pl-0 lg:pl-64 transition-all duration-300">
          <div className="min-h-[calc(100vh-88px)] py-4 sm:py-6">
            {currentPage === 'login' && !isStaticHost() ? (
              <LoginView
                onLoginSuccess={(token) => {
                  saveLocalApiToken(token);
                  setIsAuthGateActive(false);
                  navigateTo('dashboard');
                }}
                onCancel={() => {
                  setIsAuthGateActive(false);
                  navigateTo('field');
                }}
              />
            ) : currentPage === 'dashboard' ? (
              <DashboardView
                onNavigate={navigateTo}
                onEditSurvey={(survey) => navigateTo('field', survey)}
              />
            ) : (
              <FieldVisitView
                onNavigate={navigateTo}
                editingSurvey={editingSurvey}
                onCancelEdit={() => navigateTo('dashboard')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Local server authentication gate modal (rendered when 401 unauthorized on local server) */}
      {isAuthGateActive && !isStaticHost() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="w-full max-w-md">
            <LoginView
              onLoginSuccess={(token) => {
                saveLocalApiToken(token);
                setIsAuthGateActive(false);
              }}
              onCancel={() => setIsAuthGateActive(false)}
            />
          </div>
        </div>
      )}

      {/* Global toast notifications (PDF/delete/sync errors) */}
      <ToastHost />
    </div>
  );
}

export default App;
