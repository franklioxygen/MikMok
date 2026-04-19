import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { AuthProvider } from "./hooks/useAuth";
import { FavoritesPage } from "./pages/Favorites";
import { FeedPage } from "./pages/Feed";
import { FolderBrowserPage } from "./pages/FolderBrowser";
import { FolderVideosPage } from "./pages/FolderVideos";
import { SettingsPage } from "./pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/feed" />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/folders" element={<FolderBrowserPage />} />
          <Route path="/folders/:id" element={<FolderVideosPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/upload" element={<Navigate replace to="/folders" />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/feed" />} />
      </Routes>
    </AuthProvider>
  );
}
