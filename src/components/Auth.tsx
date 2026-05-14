'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth({ onSession }: { onSession: (session: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });
      if (error) alert(error.message);
      else alert('Đăng ký thành công! Vui lòng kiểm tra email (nếu có) hoặc đăng nhập ngay.');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
      else onSession(data.session);
    }
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 style={{ color: 'var(--gold)', marginBottom: '20px' }}>
          {isSignUp ? 'TẠO TÀI KHOẢN CASINO' : 'ĐĂNG NHẬP GAMEO'}
        </h2>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {isSignUp && (
            <input 
              className="auth-input" 
              placeholder="Tên hiển thị (Username)" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              required 
            />
          )}
          <input 
            className="auth-input" 
            type="email" 
            placeholder="Email" 
            value={email}
            onChange={e => setEmail(e.target.value)}
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
          <button className="btn btn-gold" type="submit" disabled={loading}>
            {loading ? 'Đang xử lý...' : (isSignUp ? 'Đăng ký ngay' : 'Vào bàn chơi')}
          </button>
        </form>
        <p 
          style={{ marginTop: '20px', fontSize: '0.9rem', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay'}
        </p>
      </div>
    </div>
  );
}
