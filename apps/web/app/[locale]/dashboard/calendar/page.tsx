import { setRequestLocale } from 'next-intl/server';
import { CalendarView } from '@/components/mawid/calendar-view';

export default async function CalendarPage(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <CalendarView />;
}
