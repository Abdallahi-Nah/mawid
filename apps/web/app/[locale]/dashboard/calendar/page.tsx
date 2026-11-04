import { setRequestLocale } from 'next-intl/server';
import { CalendarView } from '@/components/mawid/calendar-view';

export default function CalendarPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return <CalendarView />;
}
