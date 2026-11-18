import TermBookingPage from '@/components/TermBookingPage';

export default function NoviTerminPage(props: {
  searchParams: Promise<{ date?: string; slot?: string; cat?: string }>;
}) {
  return <TermBookingPage {...props} mode="instructor" />;
}
