import React, { useState, useEffect } from 'react';
import { Spotlight } from '@/components/ui/spotlight';
import { ToastHost } from '@/components/ui/toast';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { FieldVisitView } from '@/components/field/FieldVisitView';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function App() {
  const { isDark } = useTheme();
  const [currentPage, setCurrentPage] = useState(() => {
    const path = window.location.pathname;
    if (path === '/dashboard') return 'dashboard';
    return 'field';
  });

  const [editingSurvey, setEditingSurvey] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigateTo = (page, extra = null) => {
    setMobileMenuOpen(false);
    if (page === 'field') {
      setEditingSurvey(extra || null);
    } else {
      setEditingSurvey(null);
    }
    setCurrentPage(page);
    const targetUrl = page === 'dashboard' ? '/dashboard' : '/';
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, '', targetUrl);
    }
  };

  // Sync state with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setMobileMenuOpen(false);
      setEditingSurvey(null);
      const path = window.location.pathname;
      if (path === '/dashboard') setCurrentPage('dashboard');
      else setCurrentPage('field');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect to home if browsing to legacy /login URL
  useEffect(() => {
    if (window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
      setEditingSurvey(null);
      setCurrentPage('field');
    }
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
            {currentPage === 'dashboard' ? (
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

      {/* Global toast notifications (PDF/delete/sync errors) */}
      <ToastHost />
    </div>
  );
}

export default App;
