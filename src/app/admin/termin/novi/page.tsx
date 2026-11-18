import TermBookingPage from '@/components/TermBookingPage';

export default function AdminTerminNoviPage(props: {
  searchParams: Promise<{ date?: string; slot?: string; cat?: string }>;
}) {
  return <TermBookingPage {...props} mode="admin" />;
}
