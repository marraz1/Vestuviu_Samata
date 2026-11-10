import { NavLink, Outlet } from 'react-router-dom';
import { lt } from '../i18n/lt';

const links = [
  ['/', lt.nav.home],
  ['/islaidos', lt.nav.expenses],
  ['/kategorijos', lt.nav.categories],
  ['/mokejimai', lt.nav.calendar],
  ['/tiekejai', lt.nav.suppliers],
  ['/sveciai', lt.nav.guests],
  ['/finansavimas', lt.nav.funding],
  ['/ataskaitos', lt.nav.reports],
  ['/nustatymai', lt.nav.settings],
] as const;

// Bottom bar shows the 4 most used screens on phones; desktop gets a sidebar.
const mobile = new Set(['/', '/islaidos', '/mokejimai', '/nustatymai']);

function linkClass({ isActive }: { isActive: boolean }) {
  return `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-teal-700 text-white' : 'text-stone-700 hover:bg-stone-200'}`;
}

export function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <nav aria-label="Pagrindinis meniu" className="hidden w-56 shrink-0 border-r border-stone-200 p-4 md:block">
        <p className="mb-4 text-lg font-semibold text-teal-800">{lt.appName}</p>
        <ul className="space-y-1">
          {links.map(([to, label]) => (
            <li key={to}><NavLink to={to} end={to === '/'} className={linkClass}>{label}</NavLink></li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:pb-6">
        <Outlet />
      </main>
      <nav aria-label="Greitas meniu" className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white md:hidden">
        <ul className="grid grid-cols-4">
          {links.filter(([to]) => mobile.has(to)).map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'} className={({ isActive }) => `block py-3 text-center text-xs ${isActive ? 'font-semibold text-teal-800' : 'text-stone-600'}`}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
