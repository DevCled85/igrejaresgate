import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Loader2 } from 'lucide-react';
import { mockService, supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import bannerImg from '../images/Banner_resgate.png';
import logoImg from '../images/Favicon_final.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isAdmin = localStorage.getItem('admin_session');
    if (isAdmin) navigate('/admin');
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      // Busca perfil que coincide com usuário e senha
      const { data, error } = await supabase
        .from('admin_perfil')
        .select('*')
        .eq('usuario', username)
        .eq('senha', password)
        .single();

      if (data && !error) {
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_user', username);
        navigate('/admin');
      } else {
        alert('Usuário ou senha incorretos');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao conectar ao servidor ou credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-espresso">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="wood-card w-full max-w-md p-8"
      >
        <div className="text-center mb-8">
          <div className="w-full h-32 bg-espresso rounded-xl mb-6 overflow-hidden border border-amber-600/20 shadow-inner">
            <img src={bannerImg} alt="Banner" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-black text-white font-serif uppercase tracking-tight">Área Administrativa</h1>
          <p className="text-stone-500 text-[10px] uppercase tracking-[0.2em] font-bold mt-1">Portal de Gerenciamento</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="label-text">Usuário</label>
            <div className="relative">
              <input 
                required
                type="text"
                className="input-field !pl-14"
                placeholder="Seu usuário"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <User className="w-6 h-6 text-amber-500/40 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="label-text">Senha</label>
            <div className="relative">
              <input 
                required
                type="password"
                className="input-field !pl-14"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <Lock className="w-6 h-6 text-amber-500/40 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <button 
            disabled={loading}
            type="submit" 
            className="gold-button w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
          </button>
        </form>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-6 text-stone-500 text-sm hover:text-amber-500 transition-colors"
        >
          Voltar para a página pública
        </button>
      </motion.div>
    </div>
  );
}
