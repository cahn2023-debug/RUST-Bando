import React, { useState } from 'react';
import { useAuthStore } from '@IMPLEMENT/stores/useAuthStore';
import { Mail, Lock, LogIn, AlertCircle, Loader2 } from 'lucide-react';

export const AuthOverlay: React.FC = () => {
  const { loginEmail, signUpEmail, loginGoogle, loading, error, clearError } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await loginEmail(email, password);
    } else {
      await signUpEmail(email, password);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[12px] transition-all animate-in fade-in duration-700">
      <div className="w-full max-w-md p-10 bg-[#121212]/90 border border-white/[0.08] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.8)] rounded-[2rem] relative overflow-hidden group">
        {/* Advanced Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cad-accent/40 to-transparent" />
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-cad-accent/20 blur-[100px] rounded-full group-hover:bg-cad-accent/30 transition-all duration-1000 animate-pulse" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full group-hover:bg-blue-600/20 transition-all duration-1000" />

        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-cad-accent to-cad-accent/60 flex items-center justify-center rounded-2xl mb-6 shadow-[0_0_40px_rgba(var(--cad-accent-rgb),0.3)] transform group-hover:scale-105 transition-transform duration-500">
              <span className="text-black font-black text-4xl italic tracking-tighter">AG</span>
            </div>
            <h1 className="text-3xl font-display font-black tracking-tighter text-white uppercase text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              {isLogin ? 'Antigravity OS' : 'Forge Identity'}
            </h1>
            <p className="text-cad-text-muted text-[10px] uppercase font-bold tracking-[0.2em] mt-3 opacity-60">
              {isLogin ? 'Secure Gateway Protocol activated' : 'Initialize professional workspace'}
            </p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-red-500/20 p-1.5 rounded-md">
                <AlertCircle size={14} className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-[12px] text-red-100 font-medium leading-relaxed">{error}</p>
                <button onClick={clearError} className="text-[10px] text-red-400/80 font-bold uppercase tracking-wider mt-2 hover:text-red-300 transition-colors">Clear Warning</button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-cad-text-muted/80 uppercase tracking-widest ml-1">Universal Identifier</label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cad-text-muted group-focus-within/input:text-cad-accent transition-colors duration-300">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-cad-accent/40 focus:bg-black/60 transition-all duration-300"
                  placeholder="commander@antigravity.ia"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-cad-text-muted/80 uppercase tracking-widest ml-1">Access Fragment</label>
              <div className="relative group/input">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cad-text-muted group-focus-within/input:text-cad-accent transition-colors duration-300">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-cad-accent/40 focus:bg-black/60 transition-all duration-300"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.97] hover:bg-cad-accent shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-cad-accent/20 mt-8 group/btn"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <span className="text-sm uppercase tracking-widest">{isLogin ? 'Initiate Core' : 'Deploy Identity'}</span>
                  <LogIn size={20} className="group-hover/btn:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.05]"></div></div>
            <div className="relative flex justify-center text-[9px] uppercase font-black tracking-[0.3em]"><span className="bg-[#121212] px-6 text-white/30 italic">Biometric Override</span></div>
          </div>

          <button
            onClick={loginGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-[#1A1A1A] hover:bg-[#252525] border border-white/10 text-white font-bold py-3.5 rounded-xl transition-all transform active:scale-[0.97] shadow-lg"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            </svg>
            <span className="text-[11px] uppercase tracking-widest font-black">Secure Google Auth</span>
          </button>

          <div className="mt-10 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-[10px] uppercase font-black tracking-widest text-white/40 hover:text-cad-accent transition-all hover:tracking-[0.15em]"
            >
              {isLogin ? "Generate new frequency" : "Return to control terminal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
