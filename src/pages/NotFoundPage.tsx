import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { usePageMeta } from "@/lib/use-page-meta";

export default function NotFoundPage() {
  usePageMeta({ title: "Page not found | HVACHelp", noindex: true });
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-4xl font-extrabold text-navy">Page not found</h1>
        <p className="mt-3 text-slate-600">The page you were looking for doesn&apos;t exist.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-primary">Back to the homepage</Link>
      </main>
      <Footer />
    </>
  );
}
