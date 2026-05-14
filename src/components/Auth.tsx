'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth({ onSession }: { onSession: (session: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Tạo email giả từ username để khớp với yêu cầu của Supabase Auth
    const internalEmail = `${username.trim().toLowerCase()}@gameo.internal`;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: internalEmail,
        password,
        options: { data: { username } }
      });
      if (error) alert(error.message);
      else alert('Đăng ký thành công! Hãy đăng nhập ngay.');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: internalEmail, 
        password 
      });
      if (error) alert('Tên đăng nhập hoặc mật khẩu không đúng!');
      else onSession(data.session);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 style={{ color: 'var(--gold)', marginBottom: '10px' }}>GAMEO CASINO</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '30px', fontSize: '0.9rem' }}>
          {isSignUp ? 'Tạo tài khoản mới' : 'Đăng nhập vào bàn chơi'}
        </p>
        
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input 
            className="auth-input" 
            placeholder="Tên đăng nhập" 
            value={username}
            onChange={e => setUsername(e.target.value)}
            required 
          />
          <input 
            className="auth-input" 
            type="password" 
            placeholder="Mật khẩu" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            required 
          />
          <button className="btn btn-gold" type="submit" disabled={loading} style={{ marginTop: '10px' }}>
            {loading ? 'Đang kết nối...' : (isSignUp ? 'ĐĂNG KÝ' : 'VÀO CHƠI NGAY')}
          </button>
        </form>
        
        <p 
          style={{ marginTop: '25px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--gold)' }}
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký tại đây'}
        </p>
      </div>
    </div>
  );
}
