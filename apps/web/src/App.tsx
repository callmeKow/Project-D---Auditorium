import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './state/authStore';
import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { ExplorePage } from './pages/ExplorePage';
import { LobbyPage } from './pages/LobbyPage';
import { SeatSelectionPage } from './pages/SeatSelectionPage';
import { AuditoriumPage } from './pages/AuditoriumPage';
import { PerformerSetupPage } from './pages/PerformerSetupPage';
import { AdminConsolePage } from './pages/AdminConsolePage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-stone-950 text-stone-100">
          <Navbar />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/lobby" element={<LobbyPage />} />
            <Route path="/concerts/:roomId/seats" element={<SeatSelectionPage />} />
            <Route path="/room/:roomId" element={<AuditoriumPage />} />
            <Route path="/performer/:roomId/setup" element={<PerformerSetupPage />} />
            <Route path="/admin" element={<AdminConsolePage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
