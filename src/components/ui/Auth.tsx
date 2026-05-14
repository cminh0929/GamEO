'use client';

import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

import type { Session } from '@supabase/supabase-js';

export function Auth({ onSession }: { onSession: (session: Session) => void }) {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const passwordStrength = password.length === 0 ? 'none'
    : password.length < 6 ? 'weak'
    : password.length < 10 ? 'medium'
    : 'strong';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSignUp && password !== confirmPassword) {
      alert('❌ Mật khẩu không khớp! Vui lòng nhập lại.');
      return;
    }
    if (isSignUp && password.length < 6) {
      alert('❌ Mật khẩu quá ngắn! Cần tối thiểu 6 ký tự.');
      return;
    }

    setLoading(true);
    
    const internalEmail = `${username.trim().toLowerCase()}@gameo.internal`;

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: internalEmail,
        password,
        options: { data: { username } }
      });
      
      if (error) {
        console.error("SignUp Error:", error);
        alert(`Lỗi đăng ký: ${error.message} (Mẹo: Kiểm tra xem đã tắt 'Confirm Email' trong Supabase chưa)`);
      } else {
        if (data.session) onSession(data.session);
        else {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ 
            email: internalEmail, 
            password 
          });
          if (signInError) {
            console.error("SignIn After SignUp Error:", signInError);
            alert('Đăng ký xong nhưng không thể tự động đăng nhập. Vui lòng kiểm tra cấu hình Authentication.');
          }
          else onSession(signInData.session);
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: internalEmail, 
        password 
      });
      if (error) {
        console.error("SignIn Error:", error);
        alert(`Lỗi đăng nhập: ${error.message}`);
      }
      else onSession(data.session);
    }
    setLoading(false);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-overlay"></div>
      
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-icon">👑</div>
          <h2 className="logo-text">GAMEO CASINO</h2>
          <div className="auth-subtitle">
            {isSignUp ? 'KHỞI TẠO TÀI KHOẢN HOÀNG GIA' : 'CHÀO MỪNG TRỞ LẠI SÒNG BÀI'}
          </div>
        </div>
        
        <form onSubmit={handleAuth} className="auth-form">
          <div className="input-group">
            <span className="input-icon">👤</span>
            <input 
              className="auth-input" 
              placeholder="Tên đăng nhập" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              required 
            />
          </div>

          <div className="input-group">
            <span className="input-icon">🔒</span>
            <input 
              className="auth-input" 
              type="password" 
              placeholder="Mật khẩu" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required 
            />
          </div>

          {/* Password strength bar — only visible when typing during sign up */}
          {isSignUp && passwordStrength !== 'none' && (
            <div className="password-strength">
              <div className={`strength-bar strength-${passwordStrength}`} />
              <span className={`strength-label strength-label-${passwordStrength}`}>
                {passwordStrength === 'weak' && '🔴 Quá ngắn (< 6 ký tự)'}
                {passwordStrength === 'medium' && '🟡 Tạm ổn'}
                {passwordStrength === 'strong' && '🟢 Mạnh'}
              </span>
            </div>
          )}

          {/* Confirm password — only in sign-up mode */}
          {isSignUp && (
            <div className="input-group">
              <span className="input-icon">🔑</span>
              <input 
                className="auth-input"
                type="password"
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          {/* Mismatch indicator */}
          {isSignUp && confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="confirm-mismatch">❌ Mật khẩu không khớp</p>
          )}

          <button className="btn-auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="loader"></span>
            ) : (
              isSignUp ? 'ĐĂNG KÝ & NHẬN 10M 💰' : 'VÀO SÒNG BÀI NGAY'
            )}
          </button>
        </form>
        
        <div className="auth-footer">
          <p onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
            <span>{isSignUp ? 'ĐĂNG NHẬP' : 'ĐĂNG KÝ TẠI ĐÂY'}</span>
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-wrapper {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          background: radial-gradient(circle at center, #1a1a1a 0%, #000000 100%);
          z-index: 1000;
          font-family: 'Inter', sans-serif;
        }

        .auth-overlay {
          position: absolute;
          width: 100%; height: 100%;
          background: url('https://www.transparenttextures.com/patterns/carbon-fibre.png');
          opacity: 0.2;
          pointer-events: none;
        }

        .auth-card {
          position: relative;
          width: 420px;
          background: rgba(20, 20, 20, 0.7);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(212, 175, 55, 0.1);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .auth-header {
          text-align: center;
          margin-bottom: 35px;
        }

        .logo-icon {
          font-size: 3rem;
          margin-bottom: 10px;
          filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0.5));
        }

        .logo-text {
          font-size: 2.2rem;
          font-weight: 900;
          color: #d4af37;
          letter-spacing: 3px;
          margin: 0;
          text-shadow: 0 0 20px rgba(212, 175, 55, 0.3);
        }

        .auth-subtitle {
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.8rem;
          margin-top: 8px;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .input-group {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 15px;
          font-size: 1.1rem;
          opacity: 0.6;
        }

        .auth-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 14px 14px 14px 45px;
          color: white;
          font-size: 1rem;
          transition: all 0.3s;
        }

        .auth-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.1);
          border-color: #d4af37;
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.2);
        }

        .btn-auth-submit {
          margin-top: 10px;
          background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%);
          color: black;
          border: none;
          border-radius: 12px;
          padding: 16px;
          font-size: 1.1rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
        }

        .btn-auth-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px rgba(212, 175, 55, 0.3);
          filter: brightness(1.1);
        }

        .btn-auth-submit:active {
          transform: translateY(0);
        }

        .password-strength {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: -10px;
        }

        .strength-bar {
          height: 4px;
          border-radius: 2px;
          flex: 1;
          transition: all 0.3s;
        }

        .strength-weak   { background: #ff4444; width: 33%; }
        .strength-medium { background: #ffaa00; width: 66%; }
        .strength-strong { background: #00cc66; width: 100%; }

        .strength-label {
          font-size: 0.75rem;
          white-space: nowrap;
        }

        .strength-label-weak   { color: #ff4444; }
        .strength-label-medium { color: #ffaa00; }
        .strength-label-strong { color: #00cc66; }

        .confirm-mismatch {
          color: #ff4444;
          font-size: 0.8rem;
          margin: -12px 0 0;
          padding-left: 4px;
        }

        .auth-footer {
          margin-top: 30px;
          text-align: center;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .auth-footer span {
          color: #d4af37;
          font-weight: bold;
          cursor: pointer;
          margin-left: 5px;
        }

        .auth-footer span:hover {
          text-decoration: underline;
        }

        .loader {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(0, 0, 0, 0.2);
          border-top-color: black;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
