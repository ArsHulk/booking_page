import { BookingForm } from "./BookingForm";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot = "" } = await searchParams;
  return <BookingForm slotId={slot} />;
}
