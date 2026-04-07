import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useMidnightWallet } from "./hooks/useMidnightWallet";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import RegisterPage from "./pages/RegisterPage";
import AdminPage from "./pages/AdminPage";

function App() {
  const wallet = useMidnightWallet();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            wallet.isConnected
              ? <Navigate to="/dashboard" replace />
              : <LandingPage wallet={wallet} />
          }
        />
        <Route
          path="/dashboard"
          element={
            wallet.isConnected
              ? <DashboardPage wallet={wallet} />
              : <Navigate to="/" replace />
          }
        />
        <Route
          path="/register"
          element={
            wallet.isConnected
              ? <RegisterPage wallet={wallet} />
              : <Navigate to="/" replace />
          }
        />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
