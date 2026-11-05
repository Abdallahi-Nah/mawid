import { notFound } from 'next/navigation';

// Any unknown address inside a language ends here, so the 404 page is drawn inside the layout
// (with lang, dir and the language switcher) instead of the plain default page.
export default function CatchAll() {
  notFound();
}
