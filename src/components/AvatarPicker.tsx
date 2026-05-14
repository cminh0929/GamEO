'use client';

import React, { useState } from 'react';
import { PRESET_AVATARS } from '../lib/constants';
import { supabase } from '../lib/supabase';

interface AvatarPickerProps {
  currentAvatar?: string;
  userId: string;
  onUpdate: (url: string) => void;
  onClose: () => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({ currentAvatar, userId, onUpdate, onClose }) => {
  const [uploading, setUploading] = useState(false);

  const handlePresetSelect = async (url: string) => {
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
    if (!error) onUpdate(url);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      if (updateError) {
        console.error('Profile update error:', updateError);
        throw updateError;
      }

      onUpdate(publicUrl);
    } catch (error: any) {
      console.error('Full process error:', error);
      alert('Lỗi tải ảnh: ' + (error.message || 'Không xác định'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="avatar-picker-overlay">
      <div className="avatar-picker-modal">
        <h3>CHỌN ẢNH ĐẠI DIỆN</h3>
        
        <div className="preset-grid">
          {PRESET_AVATARS.map((url, i) => (
            <div 
              key={i} 
              className={`avatar-item ${currentAvatar === url ? 'selected' : ''}`}
              onClick={() => handlePresetSelect(url)}
            >
              <img src={url} alt={`Avatar ${i}`} />
            </div>
          ))}
        </div>

        <div className="upload-section">
          <p>Hoặc tải ảnh từ máy tính:</p>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileUpload} 
            disabled={uploading}
            id="avatar-upload"
            hidden
          />
          <label htmlFor="avatar-upload" className="btn-upload">
            {uploading ? 'Đang tải...' : '📁 Tải ảnh lên'}
          </label>
        </div>

        <button className="btn-close" onClick={onClose}>Đóng</button>
      </div>

      <style jsx>{`
        .avatar-picker-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .avatar-picker-modal {
          background: #1a1a1a;
          border: 2px solid #d4af37;
          border-radius: 20px;
          padding: 30px;
          width: 400px;
          text-align: center;
        }
        h3 { color: #d4af37; margin-bottom: 20px; }
        .preset-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 25px;
        }
        .avatar-item {
          cursor: pointer;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid transparent;
          transition: all 0.2s;
        }
        .avatar-item:hover { transform: scale(1.1); border-color: #d4af37; }
        .avatar-item.selected { border-color: #d4af37; box-shadow: 0 0 10px #d4af37; }
        .avatar-item img { width: 100%; height: 100%; object-fit: cover; }
        
        .upload-section {
          margin: 20px 0;
          padding: 15px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .btn-upload {
          display: inline-block;
          margin-top: 10px;
          padding: 8px 20px;
          background: #d4af37;
          color: black;
          border-radius: 20px;
          cursor: pointer;
          font-weight: bold;
        }
        .btn-close {
          margin-top: 10px;
          background: none;
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 5px 20px;
          border-radius: 10px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};
