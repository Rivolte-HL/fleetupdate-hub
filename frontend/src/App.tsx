import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { ToastProvider } from "./context/ToastContext.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { Navbar } from "./components/Navbar.js";
import { Sidebar } from "./components/Sidebar.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { HostsPage } from "./pages/HostsPage.js";
import { HostDetailPage } from "./pages/HostDetailPage.js";
import { UpdatesHistoryPage } from "./pages/UpdatesHistoryPage.js";
import { CredentialsVaultPage } from "./pages/CredentialsVaultPage.js";
import { AuditLogsPage } from "./pages/AuditLogsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { TwoFactorSetupModal } from "./pages/TwoFactorSetupModal.js";
import { ChangePasswordModal } from "./components/ChangePasswordModal.js";

const ProtectedLayout: React.FC = () => {
  const { user, loading, refreshUser } = useAuth();
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-xs font-mono text-cyan-400">
        Chargement de l'environnement sécurisé FleetUpdate-Hub...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      <Navbar
        onOpen2FAModal={() => setShow2FAModal(true)}
        onOpenPasswordModal={() => setShowPasswordModal(true)}
      />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/hosts" element={<HostsPage />} />
            <Route path="/hosts/:id" element={<HostDetailPage />} />
            <Route path="/updates" element={<UpdatesHistoryPage />} />
            <Route path="/vault" element={<CredentialsVaultPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {show2FAModal && (
        <TwoFactorSetupModal
          onClose={() => setShow2FAModal(false)}
          onSuccess={() => {
            refreshUser();
            setShow2FAModal(false);
          }}
        />
      )}

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
