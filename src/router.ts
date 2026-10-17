import { signal } from '@preact/signals';

export type Route =
  | { name: 'today' }
  | { name: 'plan'; month?: string }
  | { name: 'day'; date: string }
  | { name: 'progress'; move?: string }
  | { name: 'body' }
  | { name: 'settings'; section?: string }
  | { name: 'setup' };

export function parse(hash: string): Route {
  const [path, ...rest] = hash.replace(/^#\/?/, '').split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  switch (path) {
    case 'plan':
      return { name: 'plan', month: arg };
    case 'day':
      return arg ? { name: 'day', date: arg } : { name: 'plan' };
    case 'progress':
      return { name: 'progress', move: arg };
    case 'body':
      return { name: 'body' };
    case 'settings':
      return { name: 'settings', section: arg };
    case 'setup':
      return { name: 'setup' };
    default:
      return { name: 'today' };
  }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'today':
      return '#/';
    case 'plan':
      return r.month ? `#/plan/${r.month}` : '#/plan';
    case 'day':
      return `#/day/${r.date}`;
    case 'progress':
      return r.move ? `#/progress/${encodeURIComponent(r.move)}` : '#/progress';
    case 'body':
      return '#/body';
    case 'settings':
      return r.section ? `#/settings/${r.section}` : '#/settings';
    case 'setup':
      return '#/setup';
  }
}

export const route = signal<Route>(parse(location.hash));

window.addEventListener('hashchange', () => {
  route.value = parse(location.hash);
  // Move focus to the new screen's heading for screen-reader and keyboard users.
  requestAnimationFrame(() => {
    const h = document.querySelector<HTMLElement>('main h1');
    h?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
});

export function go(r: Route) {
  location.hash = href(r);
}
