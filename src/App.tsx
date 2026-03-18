import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import Drafts from "@/pages/Drafts";
import NewDraft from "@/pages/NewDraft";
import EditDraft from "@/pages/EditDraft";
import PreviewDraft from "@/pages/PreviewDraft";
import Share from "@/pages/Share";
import AppShell from "@/layouts/AppShell";
import Campaigns from "@/pages/Campaigns";
import Keywords from "@/pages/Keywords";
import Settings from "@/pages/Settings";
import RichMenus from "@/pages/RichMenus";
import RichMenuEditor from "@/pages/RichMenuEditor";
import ProtectedRoute from "@/components/ProtectedRoute";
import { diagnoseSupabase } from "@/debug-supabase";

if (import.meta.env.DEV) {
  (window as any).diagnoseSupabase = diagnoseSupabase;
  console.log('💡 診斷工具已載入，請在 Console 中執行: diagnoseSupabase()');
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="home" element={<Navigate to="/drafts" replace />} />
        <Route path="drafts" element={<Drafts />} />
        <Route path="drafts/new" element={<NewDraft />} />
        <Route path="drafts/:id/edit" element={<EditDraft />} />
        <Route path="drafts/:id/preview" element={<PreviewDraft />} />
        <Route path="rich-menus" element={<RichMenus />} />
        <Route path="rich-menus/:id/edit" element={<RichMenuEditor />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="keywords" element={<Keywords />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/share" element={<Share />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
