import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { lt } from './i18n/lt';
import { Placeholder } from './routes/Placeholder';

// HashRouter: GitHub Pages cannot rewrite deep links to index.html.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Placeholder title={lt.nav.home} />} />
          <Route path="islaidos" element={<Placeholder title={lt.nav.expenses} />} />
          <Route path="kategorijos" element={<Placeholder title={lt.nav.categories} />} />
          <Route path="mokejimai" element={<Placeholder title={lt.nav.calendar} />} />
          <Route path="tiekejai" element={<Placeholder title={lt.nav.suppliers} />} />
          <Route path="sveciai" element={<Placeholder title={lt.nav.guests} />} />
          <Route path="finansavimas" element={<Placeholder title={lt.nav.funding} />} />
          <Route path="ataskaitos" element={<Placeholder title={lt.nav.reports} />} />
          <Route path="nustatymai" element={<Placeholder title={lt.nav.settings} />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
