'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, MessageSquare, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      router.push('/inbox');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#25D366] rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <MessageSquare size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef]">Nibirapon Business</h1>
          <p className="text-sm text-gray-500 dark:text-[#8696a0] mt-1">WhatsApp Business Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#1f2c34] rounded-2xl shadow-xl border border-gray-100 dark:border-[#2a3942] p-8">
          <h2 className="text-lg font-semibold text-[#111b21] dark:text-[#e9edef] mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-1.5 uppercase tracking-wide">
                Email, Username or Phone
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. john@example.com or johndoe"
                required
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#111b21] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#111b21] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-4 py-3 pr-11 text-sm outline-none focus:border-[#25D366] focus:ring-1 focus:ring-[#25D366] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696a0] hover:text-gray-600 dark:hover:text-[#e9edef]"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#25D366] hover:bg-[#22c55e] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-[#667781] mt-6">
          Contact your admin to get access credentials.
        </p>
      </div>
    </div>
  );
}
