import { redirect } from 'next/navigation';

/** Stranica zahteva za čas je isključena – klijent ne šalje zahteve; redirect na početnu. */
export default async function UcenikZahtevPage() {
  redirect('/ucenik');
}
