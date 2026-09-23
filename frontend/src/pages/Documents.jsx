import { useState, useEffect, useRef } from 'react';
import { documentService } from '../services/documentService';
import { categoryService } from '../services/categoryService';
import { 
  FileText, 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Search,
  FolderOpen,
  Plus,
  X,
  FileCheck,
  Cpu,
  Layers,
  Activity
} from 'lucide-react';
import './Documents.css';

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md', 'pptx', 'png', 'jpg', 'jpeg', 'webp'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filterCat, setFilterCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileRef = useRef();

  const fetchAll = async () => {
    try {
      const [docsRes, catRes] = await Promise.all([
        documentService.getAll(filterCat || undefined),
        categoryService.getAll(),
      ]);
      setDocuments(docsRes.data.data.documents || []);
      setCategories(catRes.data.data.categories || []);
    } catch { 
      setError('Failed to fetch document repository.'); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchAll(); }, [filterCat]);

  const MAX_CONCURRENT_UPLOADS = 3;

  // Poll for document status updates every 2.5s while active documents are in UPLOADED or PROCESSING states
  useEffect(() => {
    const hasActiveProcessing = documents.some(
      d => d.upload_status === 'UPLOADED' || d.upload_status === 'PROCESSING' || d.upload_status === 'uploaded' || d.upload_status === 'processing'
    );

    if (!hasActiveProcessing) return;

    const pollInterval = setInterval(async () => {
      try {
        const docsRes = await documentService.getAll(filterCat || undefined);
        const updatedDocs = docsRes.data?.data?.documents || [];
        
        // Check if any document just finished indexing
        const previouslyProcessing = documents.filter(
          d => d.upload_status === 'PROCESSING' || d.upload_status === 'processing' || d.upload_status === 'UPLOADED' || d.upload_status === 'uploaded'
        ).map(d => d.id);
        const nowIndexed = updatedDocs.filter(
          d => previouslyProcessing.includes(d.id) && (d.upload_status === 'INDEXED' || d.upload_status === 'completed')
        );
        if (nowIndexed.length > 0) {
          const names = nowIndexed.map(d => d.original_filename).join(', ');
          setSuccess(`✅ ${names} indexed successfully! You can now ask questions in AI Chat.`);
        }
        
        // Check for failures
        const nowFailed = updatedDocs.filter(
          d => previouslyProcessing.includes(d.id) && (d.upload_status === 'FAILED' || d.upload_status === 'failed')
        );
        if (nowFailed.length > 0) {
          setError(`Failed to index: ${nowFailed.map(d => d.original_filename).join(', ')}`);
        }

        setDocuments(updatedDocs);
      } catch (err) {
        console.error('Document polling notice:', err);
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [documents, filterCat]);

  const uploadFiles = async (filesToUpload, categoryId = selectedCategory) => {
    if (!filesToUpload || filesToUpload.length === 0) return;
    setError(''); setSuccess('');
    setUploading(true); 
    setUploadProgress(10);
    setUploadStage(`Processing ${filesToUpload.length} file(s) with max ${MAX_CONCURRENT_UPLOADS} concurrent uploads...`);

    const queue = [...filesToUpload];
    const results = [];
    let completedCount = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        const formData = new FormData();
        formData.append('files', file);
        if (categoryId) formData.append('category_id', categoryId);

        try {
          const res = await documentService.upload(formData);
          results.push({ file: file.name, success: true, res });
        } catch (err) {
          results.push({ file: file.name, success: false, error: err.response?.data?.error || err.message });
        }
        completedCount++;
        setUploadProgress(Math.round((completedCount / filesToUpload.length) * 100));
        setUploadStage(`Uploaded ${completedCount} of ${filesToUpload.length} file(s)...`);
      }
    };

    const workers = [];
    const numWorkers = Math.min(MAX_CONCURRENT_UPLOADS, filesToUpload.length);
    for (let i = 0; i < numWorkers; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    setUploadProgress(100);

    if (failed.length === 0) {
      setSuccess(`${successful.length} file(s) uploaded! ⏳ Background indexing in progress — badges will update to INDEXED when ready for AI Chat.`);
    } else if (successful.length > 0) {
      setSuccess(`${successful.length} file(s) uploaded.`);
      setError(`Failed: ${failed.map(f => f.file).join(', ')}.`);
    } else {
      setError(`Upload failed. Please check file format or backend connection.`);
    }

    setSelectedFiles([]);
    setUploading(false); 
    setUploadProgress(0); 
    setUploadStage('');
    if (fileRef.current) fileRef.current.value = '';
    fetchAll();
  };

  const handleFileSelect = (incomingFiles) => {
    if (!incomingFiles || incomingFiles.length === 0) return;
    setError(''); setSuccess('');
    
    const valid = [];
    const invalid = [];

    Array.from(incomingFiles).forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalid.push(`${file.name}: Unsupported file format.`);
      } else if (file.size > MAX_FILE_SIZE) {
        invalid.push(`${file.name}: Exceeds 50MB file size limit.`);
      } else {
        valid.push(file);
      }
    });

    if (invalid.length > 0) {
      setError(invalid.join(' '));
    }

    if (valid.length > 0) {
      setSelectedFiles(valid);
      // Automatically trigger upload & vector indexing immediately
      uploadFiles(valid);
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadSubmit = () => {
    if (selectedFiles.length === 0) {
      setError('Please select or browse at least one valid document to upload.');
      return;
    }
    uploadFiles(selectedFiles);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await documentService.delete(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setSuccess('Document removed successfully.');
    } catch { 
      setError('Failed to delete document.'); 
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.original_filename?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="documents-page animate-fade-in">
      <div className="page-header">
        <h1>Document Repository</h1>
        <p>Manage, upload, and organize your academic PDF documents for RAG intelligence.</p>
      </div>

      {/* Upload Zone Container */}
      <div className="upload-section glass-card">
        <div className="upload-section-header">
          <div className="section-title">
            <UploadCloud size={20} className="section-icon text-primary" />
            <h3>Upload Study Materials & Multi-Format Documents</h3>
          </div>
          <span className="badge badge-primary">PDF • Word (.docx) • Text (.txt) • Markdown (.md) • PowerPoint (.pptx)</span>
        </div>

        <div
          className={`upload-zone-modern ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
        >
          <div className="upload-icon-circle">
            <UploadCloud size={32} />
          </div>
          <div className="upload-text-content">
            <h4>Drag & Drop your Study Materials here</h4>
            <p>Supports PDF, Word (.docx), Text (.txt), Markdown (.md), PowerPoint (.pptx), and Images up to 50MB</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            Browse Files
          </button>
          <input 
            ref={fileRef} 
            type="file" 
            multiple 
            accept=".pdf,.docx,.doc,.txt,.md,.pptx,.png,.jpg,.jpeg,.webp" 
            hidden 
            onChange={e => handleFileSelect(e.target.files)} 
          />
        </div>

        {/* Selected Files Queue */}
        {selectedFiles.length > 0 && (
          <div className="selected-file-queue">
            <div className="selected-file-header">
              <span>Ready for Upload ({selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''})</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.78rem' }} onClick={() => setSelectedFiles([])}>Clear All</button>
            </div>
            <div className="selected-file-items">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="selected-file-chip">
                  <div className="selected-file-meta">
                    <FileCheck size={16} className="text-primary" />
                    <span className="selected-file-name" title={file.name}>{file.name}</span>
                    <span className="selected-file-size">({formatSize(file.size)})</span>
                  </div>
                  {!uploading && (
                    <button className="remove-file-btn" type="button" onClick={() => removeFile(idx)}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="upload-controls">
          <select 
            className="input category-select" 
            value={selectedCategory} 
            onChange={e => setSelectedCategory(e.target.value)}
            disabled={uploading}
          >
            <option value="">Choose category (optional)...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <button 
            className="btn btn-primary" 
            onClick={handleUploadSubmit} 
            disabled={uploading || selectedFiles.length === 0}
          >
            {uploading ? (
              <>
                <Sparkles className="spin" size={16} />
                <span>Processing... {uploadProgress}%</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>Start Upload & Vector Indexing</span>
              </>
            )}
          </button>
        </div>

        {uploading && (
          <div className="upload-progress-wrapper animate-fade-in">
            <div className="upload-status-text">
              <span>{uploadStage || 'Processing file upload...'}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Active Vector Indexing Animation Banner */}
      {(uploading || documents.some(d => ['PROCESSING', 'processing', 'UPLOADED', 'uploaded'].includes(d.upload_status))) && (
        <div className="indexing-active-banner glass-card animate-fade-in">
          <div className="indexing-banner-header">
            <div className="indexing-core-icon-box">
              <div className="indexing-pulse-rings">
                <span className="ring ring-1"></span>
                <span className="ring ring-2"></span>
              </div>
              <Cpu className="indexing-core-icon spin-slow" size={26} />
            </div>
            <div className="indexing-banner-title">
              <div className="indexing-headline">
                <h4>Active Vector Indexing & RAG Sync</h4>
                <span className="badge badge-warning badge-pulse">
                  <Sparkles size={12} className="spin" />
                  {uploading ? 'UPLOADING' : 'CHUNKING & EMBEDDING'}
                </span>
              </div>
              <p className="indexing-subtext">
                {uploading 
                  ? (uploadStage || `Transferring files... ${uploadProgress}%`)
                  : `Extracting text, computing semantic vector embeddings, and indexing into vector database.`}
              </p>
            </div>
          </div>

          <div className="indexing-pipeline-steps">
            <div className={`pipeline-step ${uploading ? 'active' : 'completed'}`}>
              <div className="step-icon-bubble">
                {uploading ? <Sparkles size={14} className="spin" /> : <CheckCircle2 size={14} />}
              </div>
              <span className="step-label">1. Upload & Ingest</span>
            </div>
            <div className="pipeline-connector-line">
              <div className="connector-laser" />
            </div>
            <div className={`pipeline-step ${!uploading ? 'active' : 'pending'}`}>
              <div className="step-icon-bubble">
                {!uploading ? <Sparkles size={14} className="spin" /> : <Layers size={14} />}
              </div>
              <span className="step-label">2. Semantic Chunking</span>
            </div>
            <div className="pipeline-connector-line">
              <div className="connector-laser" />
            </div>
            <div className={`pipeline-step ${!uploading ? 'active' : 'pending'}`}>
              <div className="step-icon-bubble">
                <Cpu size={14} className={!uploading ? 'pulse-icon' : ''} />
              </div>
              <span className="step-label">3. Vector Embeddings</span>
            </div>
          </div>

          <div className="indexing-progress-bar-container">
            <div className="indexing-progress-bar-track">
              <div 
                className="indexing-progress-bar-fill shimmer-laser" 
                style={{ width: uploading ? `${uploadProgress}%` : '85%' }} 
              />
            </div>
            <div className="indexing-progress-meta">
              <span>{uploading ? `${uploadProgress}% Completed` : 'Background indexing active · live updating'}</span>
              <span className="badge badge-sm badge-secondary">Auto-syncing every 2.5s</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error animate-fade-in" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success animate-fade-in" style={{ marginBottom: 20 }}>
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Filter Bar & Search */}
      <div className="doc-filter-bar glass-card">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            className="input search-input" 
            placeholder="Search documents by name..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="category-chips">
          <button 
            className={`filter-chip ${!filterCat ? 'active' : ''}`} 
            onClick={() => setFilterCat('')}
          >
            All Documents ({documents.length})
          </button>
          {categories.map(c => (
            <button 
              key={c.id} 
              className={`filter-chip ${filterCat == c.id ? 'active' : ''}`} 
              onClick={() => setFilterCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Document Grid / Skeleton Loaders */}
      {loading ? (
        <div className="doc-grid">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="doc-card glass-card skeleton-card" style={{ height: 160, padding: 20 }}>
              <div className="skeleton-title" />
              <div className="skeleton-text" style={{ width: '80%' }} />
              <div className="skeleton-text" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="empty-state glass-card">
          <FolderOpen size={48} className="empty-icon" />
          <h3>No documents found</h3>
          <p>{searchQuery ? 'No documents match your search filter.' : 'Upload your first document to begin asking RAG questions.'}</p>
        </div>
      ) : (
        <div className="doc-grid">
          {filteredDocs.map(doc => {
            const isProcessing = ['PROCESSING', 'processing', 'UPLOADED', 'uploaded'].includes(doc.upload_status);
            return (
              <div key={doc.id} className={`doc-card glass-card card-hover ${isProcessing ? 'is-indexing' : ''}`}>
                {isProcessing && <div className="card-radar-scanner" />}

                <div className="doc-card-top">
                  <div className={`doc-card-icon ${isProcessing ? 'indexing-icon-glow' : ''}`}>
                    <FileText size={24} />
                  </div>
                  <span className={`badge ${
                    (doc.upload_status === 'INDEXED' || doc.upload_status === 'completed') ? 'badge-success' : 
                    (doc.upload_status === 'FAILED' || doc.upload_status === 'failed') ? 'badge-danger' : 'badge-warning badge-pulse'
                  }`}>
                    {isProcessing ? (
                      <>
                        <Sparkles size={12} className="spin" />
                        <span>INDEXING {doc.processing_progress ? `${doc.processing_progress}%` : ''}</span>
                      </>
                    ) : (doc.upload_status || 'UPLOADED').toUpperCase()}
                  </span>
                </div>

                <div className="doc-card-body">
                  <h4 className="doc-card-title" title={doc.original_filename}>
                    {doc.original_filename}
                  </h4>
                  
                  <div className="doc-card-meta">
                    {doc.category_name && (
                      <span className="badge badge-primary">{doc.category_name}</span>
                    )}
                    <span className="meta-text">
                      {doc.total_pages ? `${doc.total_pages} pages` : ''} 
                      {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}
                    </span>
                  </div>

                  {isProcessing && (
                    <div className="card-indexing-meter">
                      <div 
                        className="card-indexing-bar shimmer-laser" 
                        style={{ width: `${doc.processing_progress || 45}%` }} 
                      />
                    </div>
                  )}
                </div>

                <div className="doc-card-actions">
                  <button 
                    className="btn btn-ghost btn-sm delete-btn" 
                    onClick={() => handleDelete(doc.id, doc.original_filename)}
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
