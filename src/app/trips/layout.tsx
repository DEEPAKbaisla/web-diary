import { AppHeader } from "@/components/app-header";

/**
 * The header lives in the layout so it stays on screen while a page is being
 * loaded, instead of being replaced by the route's loading state.
 */
export default function TripsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
