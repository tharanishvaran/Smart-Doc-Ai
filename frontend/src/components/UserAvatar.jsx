import { useState, useEffect } from 'react';

export default function UserAvatar({
  user,
  size = 36,
  fontSize,
  border,
  boxShadow,
  className = '',
  style = {},
}) {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = user?.avatar_url;

  // Reset error flag if avatarUrl changes
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  // Extract first letter of name (fallback to email, or 'U')
  const initial = (user?.name || user?.email || 'U').trim().charAt(0).toUpperCase();

  const dimension = typeof size === 'number' ? `${size}px` : size;
  const sizeStyle = {
    width: dimension,
    height: dimension,
    minWidth: dimension,
    minHeight: dimension,
  };

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={user?.name || 'User Profile'}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={className}
        style={{
          ...sizeStyle,
          borderRadius: '50%',
          objectFit: 'cover',
          border: border || 'none',
          boxShadow: boxShadow || 'none',
          flexShrink: 0,
          display: 'block',
          ...style,
        }}
      />
    );
  }

  const calculatedFontSize =
    fontSize || (typeof size === 'number' ? `${Math.max(12, Math.round(size * 0.42))}px` : '1rem');

  return (
    <div
      className={className}
      style={{
        ...sizeStyle,
        borderRadius: '50%',
        background: 'var(--primary-gradient)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: calculatedFontSize,
        border: border || 'none',
        boxShadow: boxShadow || '0 2px 10px var(--primary-glow)',
        flexShrink: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {initial}
    </div>
  );
}
