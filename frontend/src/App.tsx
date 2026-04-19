import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AuthProvider } from "./hooks/useAuth";
import { FeedPage } from "./pages/Feed";
import { FolderBrowserPage } from "./pages/FolderBrowser";
import { FolderVideosPage } from "./pages/FolderVideos";
import { SettingsPage } from "./pages/Settings";
import { UploadPage } from "./pages/Upload";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/feed" />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/folders" element={<FolderBrowserPage />} />
          <Route path="/folders/:id" element={<FolderVideosPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/feed" />} />
      </Routes>
    </AuthProvider>
  );
}
