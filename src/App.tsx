import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { lt } from './i18n/lt';
import { SessionProvider, WeddingProvider } from './lib/session';
import { AuthScreen, ResetPasswordScreen } from './routes/AuthScreen';
import { Categories } from './routes/Categories';
import { Dashboard } from './routes/Dashboard';
import { ExpenseDetail } from './routes/ExpenseDetail';
import { Expenses } from './routes/Expenses';
import { Onboarding } from './routes/Onboarding';
import { PaymentsCalendar } from './routes/PaymentsCalendar';
import { Placeholder } from './routes/Placeholder';
import { AcceptInvite, Settings } from './routes/Settings';

function resetToken(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

function MainApp() {
  return (
    <WeddingProvider empty={<Onboarding />} loading={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="islaidos" element={<Expenses />} />
          <Route path="islaidos/:id" element={<ExpenseDetail />} />
          <Route path="kategorijos" element={<Categories />} />
          <Route path="mokejimai" element={<PaymentsCalendar />} />
          <Route path="tiekejai" element={<Placeholder title={lt.nav.suppliers} />} />
          <Route path="sveciai" element={<Placeholder title={lt.nav.guests} />} />
          <Route path="finansavimas" element={<Placeholder title={lt.nav.funding} />} />
          <Route path="ataskaitos" element={<Placeholder title={lt.nav.reports} />} />
          <Route path="nustatymai" element={<Settings />} />
          <Route path="*" element={<Placeholder title="Puslapis nerastas" />} />
        </Route>
      </Routes>
    </WeddingProvider>
  );
}

// HashRouter: GitHub Pages cannot rewrite deep links to index.html.
export function App() {
  const token = resetToken();
  if (token) {
    return <ResetPasswordScreen token={token} onDone={() => { window.location.href = window.location.pathname; }} />;
  }
  return (
    <ToastProvider>
      <HashRouter>
        <SessionProvider fallback={<Spinner />}>
          {(user) =>
            !user ? (
              <AuthScreen />
            ) : (
              <Routes>
                {/* Invitations work before the user has a wedding of their own */}
                <Route path="kvietimas/:token" element={<AcceptInvite />} />
                <Route path="*" element={<MainApp />} />
              </Routes>
            )
          }
        </SessionProvider>
      </HashRouter>
    </ToastProvider>
  );
}
