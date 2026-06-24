// src/router.tsx
import { createHashRouter } from 'react-router-dom';
import Layout from '@/pages/_layout';
import HomePage from '@/pages/home';
import NotFoundPage from '@/pages/not-found';
import AuditPage from '@/pages/testing_page';

const BASENAME = new URL('.', location.href).pathname;
if (location.pathname.endsWith('/index.html')) {
  window.history.replaceState(
    null,
    '',
    BASENAME + location.search + location.hash
  );
}

export const router = createHashRouter(
  [
    {
      path: '/',
      element: <Layout showHeader={false} />,
      errorElement: <NotFoundPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'audit', element: <AuditPage /> },   // matches "#/audit"
      ],
    },
  ],
  { basename: BASENAME }
);