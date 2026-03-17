import { redirect } from 'next/navigation';

export default async function AdminViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard`);
}
