import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ScrollManager } from "@/components/ScrollManager";
import HomePage from "@/pages/HomePage";
import BlogIndexPage from "@/pages/BlogIndexPage";
import BlogPostPage from "@/pages/BlogPostPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import DirectoryPage from "@/pages/DirectoryPage";
import ListingPage from "@/pages/ListingPage";
import AddBusinessPage from "@/pages/AddBusinessPage";

// The admin area is split into its own chunk so public visitors never download it.
const PanelLayout = lazy(() => import("@/components/admin/PanelLayout"));
const OverviewReport = lazy(() => import("@/components/admin/OverviewReport").then((m) => ({ default: m.OverviewReport })));
const LeadsList = lazy(() => import("@/components/admin/LeadsList").then((m) => ({ default: m.LeadsList })));
const LeadDetail = lazy(() => import("@/components/admin/LeadDetail").then((m) => ({ default: m.LeadDetail })));
const PostsList = lazy(() => import("@/components/admin/PostsList").then((m) => ({ default: m.PostsList })));
const PostEditor = lazy(() => import("@/components/admin/PostEditor").then((m) => ({ default: m.PostEditor })));
const ListingsAdmin = lazy(() => import("@/components/admin/ListingsAdmin").then((m) => ({ default: m.ListingsAdmin })));
const ListingEditor = lazy(() => import("@/components/admin/ListingEditor").then((m) => ({ default: m.ListingEditor })));
const AnalyticsReport = lazy(() => import("@/components/admin/AnalyticsReport").then((m) => ({ default: m.AnalyticsReport })));

export default function App() {
  return (
    <>
      <ScrollManager />
      <PageViewTracker />
      <Suspense fallback={<p className="p-8 text-slate-600">Loading…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/directory/add" element={<AddBusinessPage />} />
          <Route path="/directory/:slug" element={<ListingPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<PanelLayout />}>
            <Route index element={<OverviewReport />} />
            <Route path="leads" element={<LeadsList />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="blog" element={<PostsList />} />
            <Route path="blog/new" element={<PostEditor />} />
            <Route path="blog/:id" element={<PostEditor />} />
            <Route path="listings" element={<ListingsAdmin />} />
            <Route path="listings/new" element={<ListingEditor />} />
            <Route path="listings/:id" element={<ListingEditor />} />
            <Route path="analytics" element={<AnalyticsReport />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
