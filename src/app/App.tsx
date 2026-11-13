import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';
import { MetronomePage } from '../pages/MetronomePage';
import { ClickNotes } from '../shared/ClickNotes';

const SongsPage = lazy(() => import('../pages/SongsPage').then((m) => ({ default: m.SongsPage })));

function NotFound() {
  return (
    <main className="page page-centered">
      <p className="muted">页面不存在</p>
      <Link className="btn" to="/">
        返回首页
      </Link>
    </main>
  );
}

function SongsPageFallback() {
  return (
    <main className="page page-centered">
      <p className="muted">正在加载乐谱引擎…</p>
    </main>
  );
}

/**
 * Mirror Vite's `base` into the router so sub-path deployments
 * (`DEPLOY_BASE=/musica/`) keep links and direct loads working.
 * `BASE_URL` always ends with a slash; React Router expects none, and `''`
 * (root deployment) must become `undefined`.
 */
const routerBasename = import.meta.env.BASE_URL.replace(/\/+$/, '') || undefined;

const router = createBrowserRouter(
  [
    { path: '/', element: <HomePage /> },
    {
      path: '/songs',
      element: (
        <Suspense fallback={<SongsPageFallback />}>
          <SongsPage />
        </Suspense>
      ),
    },
    {
      path: '/songs/:songId',
      element: (
        <Suspense fallback={<SongsPageFallback />}>
          <SongsPage />
        </Suspense>
      ),
    },
    { path: '/metronome', element: <MetronomePage /> },
    { path: '*', element: <NotFound /> },
  ],
  { basename: routerBasename },
);

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ClickNotes />
    </>
  );
}
