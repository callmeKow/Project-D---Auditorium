import { Link, useNavigate } from 'react-router-dom';
import { Music, LogOut, Shield, Compass, DoorOpen } from 'lucide-react';
import { useAuth } from '../state/authStore';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-amber-400">
          <Music className="h-5 w-5" />
          <span>Virtual Music World</span>
        </Link>

        <nav className="flex items-center gap-5 text-sm text-stone-300">
          <Link to="/explore" className="flex items-center gap-1.5 hover:text-amber-300">
            <Compass className="h-4 w-4" /> Explore
          </Link>
          <Link to="/lobby" className="flex items-center gap-1.5 hover:text-amber-300">
            <DoorOpen className="h-4 w-4" /> Lobby
          </Link>
          {(user?.roles.includes('ADMIN') || user?.roles.includes('HOST')) && (
            <Link to="/admin" className="flex items-center gap-1.5 hover:text-amber-300">
              <Shield className="h-4 w-4" /> Console
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-stone-800 px-3 py-1 text-xs text-amber-300">
                {user.displayName} ({user.roles[0]})
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="flex items-center gap-1 rounded border border-stone-700 px-2.5 py-1 text-xs hover:bg-stone-800"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-stone-950 hover:bg-amber-400"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
