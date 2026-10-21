/**
 * Tests for getAppBasePath, getAppRoute, getAppUrl
 */
function runTests() {
  function getAppBasePath(baseUrl = '/') {
    const base = (baseUrl || '/').trim();
    if (!base.startsWith('/')) return `/${base}`;
    return base.endsWith('/') ? base : `${base}/`;
  }

  function getAppRoute(pathname, baseUrl = '/') {
    const base = getAppBasePath(baseUrl);
    let normalized = pathname;
    if (base !== '/' && normalized.startsWith(base)) {
      normalized = normalized.slice(base.length - 1); // keep leading '/'
    } else if (base !== '/' && normalized === base.slice(0, -1)) {
      normalized = '/';
    }
    
    const clean = normalized.replace(/\/+$/, '') || '/';
    if (clean === '/dashboard') return 'dashboard';
    if (clean === '/login') return 'login';
    return 'field';
  }

  function getAppUrl(page, baseUrl = '/') {
    const base = getAppBasePath(baseUrl).replace(/\/+$/, '');
    if (page === 'dashboard') return `${base}/dashboard`;
    if (page === 'login') return `${base}/login`;
    return `${base}/` || '/';
  }

  const cases = [
    // Local / root base
    { base: '/', path: '/', expected: 'field' },
    { base: '/', path: '/dashboard', expected: 'dashboard' },
    { base: '/', path: '/dashboard/', expected: 'dashboard' },
    { base: '/', path: '/login', expected: 'login' },
    { base: '/', path: '/login/', expected: 'login' },
    { base: '/', path: '/field', expected: 'field' },
    // GitHub Pages subpath base
    { base: '/Pre_PM2/', path: '/Pre_PM2', expected: 'field' },
    { base: '/Pre_PM2/', path: '/Pre_PM2/', expected: 'field' },
    { base: '/Pre_PM2/', path: '/Pre_PM2/dashboard', expected: 'dashboard' },
    { base: '/Pre_PM2/', path: '/Pre_PM2/dashboard/', expected: 'dashboard' },
    { base: '/Pre_PM2/', path: '/Pre_PM2/login', expected: 'login' },
    { base: '/Pre_PM2/', path: '/Pre_PM2/field', expected: 'field' },
  ];

  let passed = 0;
  for (const c of cases) {
    const actual = getAppRoute(c.path, c.base);
    if (actual === c.expected) {
      console.log(`[PASS] base='${c.base}' path='${c.path}' => '${actual}'`);
      passed++;
    } else {
      console.error(`[FAIL] base='${c.base}' path='${c.path}' => expected '${c.expected}', got '${actual}'`);
    }
  }

  console.log(`\nURL Generation Tests:`);
  console.log(`  base='/' dashboard => '${getAppUrl('dashboard', '/')}' (expected '/dashboard')`);
  console.log(`  base='/' field => '${getAppUrl('field', '/')}' (expected '/')`);
  console.log(`  base='/Pre_PM2/' dashboard => '${getAppUrl('dashboard', '/Pre_PM2/')}' (expected '/Pre_PM2/dashboard')`);
  console.log(`  base='/Pre_PM2/' field => '${getAppUrl('field', '/Pre_PM2/')}' (expected '/Pre_PM2/')`);

  console.log(`\nTotal: ${passed}/${cases.length} passed.`);
  if (passed !== cases.length) process.exit(1);
}

runTests();
