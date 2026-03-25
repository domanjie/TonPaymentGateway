import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, CreditCard, Webhook, Key, Settings, Bot } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Payments from "./pages/Payments";
import Webhooks from "./pages/Webhooks";
import ApiKeys from "./pages/ApiKeys";
import SettingsPage from "./pages/SettingsPage";
import Assistant from "./pages/Assistant";
import { AuthProvider } from "./context/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-layout">
          <div className="page-content fade-in">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/assistant" element={<Assistant />} />
            </Routes>
          </div>

          <nav className="bottom-nav">
            <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <LayoutDashboard size={20} />
              Home
            </NavLink>
            <NavLink to="/payments" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <CreditCard size={20} />
              Payments
            </NavLink>
            <NavLink to="/webhooks" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Webhook size={20} />
              Webhooks
            </NavLink>
            <NavLink to="/api-keys" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Key size={20} />
              Keys
            </NavLink>
            <NavLink to="/assistant" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Bot size={20} />
              AI
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Settings size={20} />
              Settings
            </NavLink>
          </nav>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
