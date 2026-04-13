import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, UserPlus, User, Lock } from 'lucide-react';
import { THERMOPLASTICS_LOGO } from '../constants/logo';

export default function Login() {
  const { login } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'manager' | 'technician'>('technician');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      setLoading(false);
      return;
    }

    try {
      const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
      const body = isSignUp
        ? { username, password, displayName, role }
        : { username, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = { error: await res.text() };
      }

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      login(data.user);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-70 h-28 bg-white rounded-2xl shadow-lg mb-6 overflow-hidden p-4">
            <img
              src={THERMOPLASTICS_LOGO}
              alt="Thermoplastics Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback to a simple icon if image fails
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLElement).parentElement;
                if (parent) {
                  parent.innerHTML = '<div class="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl">T</div>';
                }
              }}
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Thermoplastics GMAO</h1>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-blue-900/5 border border-gray-100">
          <div className="flex items-center justify-center mb-6">
            <div className="p-3 bg-blue-50 rounded-full">
              {isSignUp ? <UserPlus className="text-blue-600" size={24} /> : <ShieldCheck className="text-blue-600" size={24} />}
            </div>
          </div>

          <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-sm text-center text-gray-500 mb-8">
            {isSignUp ? 'Join the maintenance team' : 'Sign in with your username'}
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  required
                  placeholder=""
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Full Name (Optional)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder=""
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Desired Role</label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                >
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>{isSignUp ? 'Create Account' : 'Sign In'}</>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          &copy; 2026 GMAO System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
