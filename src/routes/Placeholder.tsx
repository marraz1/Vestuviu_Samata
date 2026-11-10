import { lt } from '../i18n/lt';

export function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-stone-600">{lt.comingSoon}</p>
    </section>
  );
}
