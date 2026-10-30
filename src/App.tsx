import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ScrollManager } from "@/components/ScrollManager";
import { RevealManager } from "@/components/RevealManager";
import HomePage from "@/pages/HomePage";
import BlogIndexPage from "@/pages/BlogIndexPage";
import BlogPostPage from "@/pages/BlogPostPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import DirectoryPage from "@/pages/DirectoryPage";
import ListingPage from "@/pages/ListingPage";
import AddBusinessPage from "@/pages/AddBusinessPage";
import LocationPage from "@/pages/LocationPage";
import ContactPage from "@/pages/ContactPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import ServicePage from "@/pages/ServicePage";
import ServicesIndexPage from "@/pages/ServicesIndexPage";
import PricingPage from "@/pages/PricingPage";
import { locations } from "@/config/locations";
import { servicePages } from "@/config/serviceContent";

// The admin area is split into its own chunk so public visitors never download it.
const PanelLayout = lazy(() => import("@/components/admin/PanelLayout"));
const OverviewDashboard = lazy(() => import("@/components/admin/OverviewDashboard").then((m) => ({ default: m.OverviewDashboard })));
const LeadsList = lazy(() => import("@/components/admin/LeadsList").then((m) => ({ default: m.LeadsList })));
const LeadDetail = lazy(() => import("@/components/admin/LeadDetail").then((m) => ({ default: m.LeadDetail })));
const PostsList = lazy(() => import("@/components/admin/PostsList").then((m) => ({ default: m.PostsList })));
const PostEditor = lazy(() => import("@/components/admin/PostEditor").then((m) => ({ default: m.PostEditor })));
const ListingsAdmin = lazy(() => import("@/components/admin/ListingsAdmin").then((m) => ({ default: m.ListingsAdmin })));
const DiscoveryAdmin = lazy(() => import("@/components/admin/DiscoveryAdmin").then((m) => ({ default: m.DiscoveryAdmin })));
const ListingEditor = lazy(() => import("@/components/admin/ListingEditor").then((m) => ({ default: m.ListingEditor })));
const MessagesAdmin = lazy(() => import("@/components/admin/MessagesAdmin").then((m) => ({ default: m.MessagesAdmin })));
const SeoAudit = lazy(() => import("@/components/admin/SeoAudit").then((m) => ({ default: m.SeoAudit })));
// The contractor dashboard is its own chunk too.
const ContractorLoginPage = lazy(() => import("@/components/contractor/ContractorLoginPage"));
const ContractorLayout = lazy(() => import("@/components/contractor/ContractorLayout"));
const ContractorHome = lazy(() => import("@/components/contractor/ContractorHome"));
const ContractorLeads = lazy(() => import("@/components/contractor/ContractorLeads"));
const ContractorBusiness = lazy(() => import("@/components/contractor/ContractorBusiness"));
const ContractorBilling = lazy(() => import("@/components/contractor/ContractorBilling"));
const ContractorAccount = lazy(() => import("@/components/contractor/ContractorAccount"));
const ClaimsAdmin = lazy(() => import("@/components/admin/ClaimsAdmin").then((m) => ({ default: m.ClaimsAdmin })));
const AnalyticsReport = lazy(() => import("@/components/admin/AnalyticsReport").then((m) => ({ default: m.AnalyticsReport })));

export default function App() {
  return (
    <>
      <ScrollManager />
      <RevealManager />
      <PageViewTracker />
      <Suspense fallback={<p className="p-8 text-slate-600">Loading…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          {locations.map((l) => <Route key={l.slug} path={l.path} element={<LocationPage slug={l.slug} />} />)}
          <Route path="/services" element={<ServicesIndexPage />} />
          {servicePages.map((p) => <Route key={p.slug} path={`/services/${p.slug}`} element={<ServicePage slug={p.slug} />} />)}
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy-policy" element={<PrivacyPage />} />
          <Route path="/terms-of-use" element={<TermsPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/directory/add" element={<AddBusinessPage />} />
          <Route path="/directory/:slug" element={<ListingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/contractor/login" element={<ContractorLoginPage />} />
          <Route path="/contractor" element={<ContractorLayout />}>
            <Route index element={<ContractorHome />} />
            <Route path="leads" element={<ContractorLeads />} />
            <Route path="business" element={<ContractorBusiness />} />
            <Route path="profile" element={<Navigate to="/contractor/business" replace />} />
            <Route path="billing" element={<ContractorBilling />} />
            <Route path="account" element={<ContractorAccount />} />
          </Route>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<PanelLayout />}>
            <Route index element={<OverviewDashboard />} />
            <Route path="leads" element={<LeadsList />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="blog" element={<PostsList />} />
            <Route path="blog/new" element={<PostEditor />} />
            <Route path="blog/:id" element={<PostEditor />} />
            <Route path="listings" element={<ListingsAdmin />} />
            <Route path="listings/discover" element={<DiscoveryAdmin />} />
            <Route path="listings/claims" element={<ClaimsAdmin />} />
            <Route path="listings/new" element={<ListingEditor />} />
            <Route path="listings/:id" element={<ListingEditor />} />
            <Route path="messages" element={<MessagesAdmin />} />
            <Route path="seo-audit" element={<SeoAudit />} />
            <Route path="analytics" element={<AnalyticsReport />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
