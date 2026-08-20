import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { ToastProvider } from "./context/ToastContext.js";
import { LanguageProvider, useLanguage } from "./context/LanguageContext.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { Navbar } from "./components/Navbar.js";
import { Sidebar } from "./components/Sidebar.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { HostsPage } from "./pages/HostsPage.js";
import { HostDetailPage } from "./pages/HostDetailPage.js";
import { UpdatesHistoryPage } from "./pages/UpdatesHistoryPage.js";
import { CredentialsVaultPage } from "./pages/CredentialsVaultPage.js";
import { AuditLogsPage } from "./pages/AuditLogsPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { TwoFactorSetupModal } from "./pages/TwoFactorSetupModal.js";
import { ChangePasswordModal } from "./components/ChangePasswordModal.js";
import { NotificationSettingsModal } from "./components/NotificationSettingsModal.js";
import { DemoDashboardPage } from "./pages/DemoDashboardPage.js";

const ProtectedLayout: React.FC = () => {
  const { user, loading, refreshUser } = useAuth();
  const { t } = useLanguage();
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center text-xs font-mono text-cyan-400">
        {t('common.loading')}
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
        onOpenNotificationModal={() => setShowNotificationModal(true)}
      />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/hosts" element={<HostsPage />} />
            <Route path="/hosts/:id" element={<HostDetailPage />} />
            <Route path="/updates" element={<UpdatesHistoryPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
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

      {showNotificationModal && (
        <NotificationSettingsModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
        />
      )}
    </div>
  );
};

const DemoLayout: React.FC = () => {
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      <Navbar
        onOpen2FAModal={() => setShow2FAModal(true)}
        onOpenPasswordModal={() => setShowPasswordModal(true)}
        onOpenNotificationModal={() => setShowNotificationModal(true)}
      />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full overflow-y-auto">
          <DemoDashboardPage />
        </main>
      </div>

      {show2FAModal && (
        <TwoFactorSetupModal
          onClose={() => setShow2FAModal(false)}
          onSuccess={() => setShow2FAModal(false)}
        />
      )}

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {showNotificationModal && (
        <NotificationSettingsModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/demo" element={<DemoLayout />} />
              <Route path="/*" element={<ProtectedLayout />} />
            </Routes>
          </BrowserRouter>
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
};

export default App;
