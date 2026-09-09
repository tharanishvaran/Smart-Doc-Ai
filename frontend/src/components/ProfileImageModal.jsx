import { useState, useRef, useEffect } from 'react';
import { X, ZoomOut, Check, Camera, RotateCcw } from 'lucide-react';

export function AdjustFrameModal({ imageSrc, onClose, onSave, uploading }) {
  const [zoom, setZoom] = useState(1.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  useEffect(() => {
    drawPreviewCanvas();
  }, [imageSrc, zoom, offset]);

  const drawPreviewCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw circular clipping path
      ctx.save();
      ctx.beginPath();
      ctx.arc(125, 125, 120, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();

      // Background fill
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw scaled and offset image centered
      const aspect = img.width / img.height;
      let drawWidth = 250 * zoom;
      let drawHeight = (250 / aspect) * zoom;
      if (aspect < 1) {
        drawHeight = 250 * zoom;
        drawWidth = (250 * aspect) * zoom;
      }

      const x = 125 - drawWidth / 2 + offset.x;
      const y = 125 - drawHeight / 2 + offset.y;

      ctx.drawImage(img, x, y, drawWidth, drawHeight);
      ctx.restore();

      // Outer ring guide overlay
      ctx.strokeStyle = '#F95700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(125, 125, 120, 0, Math.PI * 2, true);
      ctx.stroke();
    };
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch handlers for mobile / smartphone support
  const handleTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    if (e.touches && e.touches[0]) {
      const touch = e.touches[0];
      setOffset({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleSaveCropped = () => {
    if (!imageSrc) return;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 300;
    outputCanvas.height = 300;
    const ctx = outputCanvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      ctx.clearRect(0, 0, 300, 300);

      // Circular clip path
      ctx.beginPath();
      ctx.arc(150, 150, 150, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 300, 300);

      const aspect = img.width / img.height;
      const scaleFactor = 300 / 250;
      let drawWidth = 250 * zoom * scaleFactor;
      let drawHeight = (250 / aspect) * zoom * scaleFactor;
      if (aspect < 1) {
        drawHeight = 250 * zoom * scaleFactor;
        drawWidth = (250 * aspect) * zoom * scaleFactor;
      }

      const x = 150 - drawWidth / 2 + (offset.x * scaleFactor);
      const y = 150 - drawHeight / 2 + (offset.y * scaleFactor);

      ctx.drawImage(img, x, y, drawWidth, drawHeight);

      // Export as high-quality, lightweight WebP or JPEG dataUrl
      let dataUrl;
      try {
        dataUrl = outputCanvas.toDataURL('image/jpeg', 0.90);
      } catch {
        dataUrl = outputCanvas.toDataURL('image/png');
      }
      onSave(dataUrl);
    };
  };

  return (
    <div 
      className="modal-backdrop animate-fade-in" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        background: 'rgba(9, 13, 22, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div className="glass-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 94vw)', padding: '20px 16px', borderRadius: 20, zIndex: 1000000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main)', fontSize: '1.05rem' }}>
            <Camera size={18} className="text-primary" /> Adjust Profile Frame
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Drag image to position inside circle and use slider to adjust frame zoom scale.
        </p>

        {/* Canvas Circular Frame with Mouse + Touch Drag Support */}
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            marginBottom: 20, 
            cursor: isDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <canvas ref={canvasRef} width={250} height={250} style={{ borderRadius: '50%', boxShadow: '0 0 25px var(--primary-glow)', maxWidth: '100%', touchAction: 'none' }} />
        </div>

        {/* Zoom Controls */}
        <div className="input-group" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.85rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-main)' }}><ZoomOut size={14} /> Zoom Scale</span>
            <span className="badge badge-primary">{zoom.toFixed(1)}x</span>
          </div>
          <input 
            type="range" 
            min="1.0" 
            max="3.0" 
            step="0.1" 
            value={zoom} 
            onChange={e => setZoom(parseFloat(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setZoom(1.2); setOffset({ x: 0, y: 0 }); }}>
            <RotateCcw size={14} /> Reset
          </button>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={uploading}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveCropped} disabled={uploading}>
              <Check size={14} /> {uploading ? 'Saving...' : 'Apply & Save Frame'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewProfileModal({ user, onClose, onChangePhoto }) {
  if (!user) return null;

  return (
    <div 
      className="modal-backdrop animate-fade-in" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        background: 'rgba(9, 13, 22, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div className="glass-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 94vw)', padding: '24px 16px', borderRadius: 20, textAlign: 'center', position: 'relative', zIndex: 1000000 }}>
        <button 
          className="btn btn-ghost btn-sm" 
          onClick={onClose} 
          style={{ position: 'absolute', top: 14, right: 14, padding: 6 }}
        >
          <X size={18} />
        </button>

        <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '1.15rem' }}>Profile Photo Preview</h3>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 20px' }}>
          {user.avatar_url ? (
            <img 
              src={user.avatar_url} 
              alt={user.name} 
              style={{
                width: 'min(200px, 50vw)',
                height: 'min(200px, 50vw)',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid var(--primary)',
                boxShadow: '0 0 35px var(--primary-glow)'
              }}
            />
          ) : (
            <div style={{
              width: 'min(200px, 50vw)',
              height: 'min(200px, 50vw)',
              borderRadius: '50%',
              background: 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(3rem, 10vw, 5rem)',
              fontWeight: 800,
              color: '#fff',
              boxShadow: '0 0 35px var(--primary-glow)'
            }}>
              {user.name?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <h2 style={{ margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '1.25rem', overflowWrap: 'break-word' }}>{user.name}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: 18, overflowWrap: 'break-word' }}>{user.email}</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {onChangePhoto && (
            <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onChangePhoto(); }}>
              <Camera size={14} /> Change Photo
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
