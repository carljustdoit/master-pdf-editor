import React, { useEffect, useRef, useState } from 'react';
import { PDFViewer } from './components/PDFViewer';
import type { TextItem } from './components/EditorLayer';
import { exportModifiedPdf } from './utils/pdfExport';
import {
  FileBox,
  Upload,
  Download,
  MousePointer2,
  Type,
  Save,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import './App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTool, setActiveTool] = useState('text');
  const [file, setFile] = useState<File | null>(null);
  const [pagesTextItems, setPagesTextItems] = useState<TextItem[][]>([]);
  const [modifications, setModifications] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDraftStorageKey = (selectedFile: File) =>
    `master-pdf-editor:draft:${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setModifications({});
      setPagesTextItems([]);
      setActiveTool('text');
      setIsDraftSaved(false);
    }
  };

  useEffect(() => {
    if (!file) return;
    const key = getDraftStorageKey(file);
    const rawDraft = window.localStorage.getItem(key);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as { modifications?: Record<string, string> };
      if (parsed.modifications) {
        setModifications(parsed.modifications);
        setIsDraftSaved(true);
      }
    } catch (error) {
      console.error('Failed to parse saved draft:', error);
    }
  }, [file]);

  const handleTextChange = (id: string, newText: string) => {
    setModifications(prev => ({ ...prev, [id]: newText }));
    setIsDraftSaved(false);
  };

  const handleSaveDraft = () => {
    if (!file) return;
    try {
      const key = getDraftStorageKey(file);
      const draft = {
        savedAt: new Date().toISOString(),
        modifications,
      };
      window.localStorage.setItem(key, JSON.stringify(draft));
      setIsDraftSaved(true);
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert('Save failed. Please check the console for details.');
    }
  };

  const scrollToPage = (pageIndex: number) => {
    const pageEl = document.getElementById(`pdf-page-${pageIndex + 1}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExport = async () => {
    if (!file || pagesTextItems.length === 0) return;

    setIsExporting(true);
    try {
      const pdfBytes = await exportModifiedPdf(file, modifications, pagesTextItems);
      const exportBytes = new Uint8Array(pdfBytes.byteLength);
      exportBytes.set(pdfBytes);
      const blob = new Blob([exportBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `modified-${file.name}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      const message = error instanceof Error
        ? error.message
        : 'Export failed. Please check the console for details.';
      alert(message);
    } finally {
      setIsExporting(false);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="app-container">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="application/pdf"
        onChange={handleFileChange}
      />
      {/* Top Navbar */}
      <nav className="top-nav glass-panel">
        <div className="logo-section">
          <FileBox className="logo-icon" />
          <h1>Master PDF Editor</h1>
        </div>

        <div className="nav-actions">
          <button className="nav-btn secondary" onClick={triggerUpload}>
            <Upload size={18} />
            <span>Open File</span>
          </button>
          <button
            className="nav-btn primary"
            onClick={handleExport}
            disabled={!file || isExporting}
          >
            <Download size={18} />
            <span>{isExporting ? 'Exporting...' : 'Export'}</span>
          </button>
        </div>
      </nav>

      <div className="main-content">
        {/* Sidebar */}
        <aside className={`sidebar glass-panel ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <h2>Pages</h2>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="toggle-sidebar">
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
          <div className="sidebar-content">
            {pagesTextItems.length > 0 ? (
              <div className="pages-list">
                {pagesTextItems.map((_, i) => (
                  <div key={i} className="page-thumbnail glass-panel" onClick={() => scrollToPage(i)}>
                    <span>Page {i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No document loaded</p>
              </div>
            )}
          </div>
        </aside>

        {/* Toolbar */}
        <div className="toolbar glass-panel">
          <button
            className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => setActiveTool('select')}
            title="Select"
          >
            <MousePointer2 size={20} />
          </button>
          <button
            className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title="Edit Text"
          >
            <Type size={20} />
          </button>
          <div className="tool-divider"></div>
          <button
            className={`tool-btn ${isDraftSaved ? 'active' : ''}`}
            title={isDraftSaved ? 'Draft saved' : 'Save draft'}
            onClick={handleSaveDraft}
            disabled={!file}
          >
            <Save size={20} />
          </button>
          <button className="tool-btn" title="Settings">
            <Settings size={20} />
          </button>
        </div>

        {/* Main Viewer Area */}
        <main className="viewer-area">
          {!file ? (
            <div className="welcome-screen animate-fade-in">
              <div className="welcome-card glass-panel">
                <FileBox size={48} className="welcome-icon" />
                <h2>Welcome to Master PDF</h2>
                <p>Upload a financial document, receipt, or statement to start editing with high precision.</p>
                <button className="upload-btn-lg" onClick={triggerUpload}>
                  <Upload size={20} />
                  Drop PDF here or click to upload
                </button>
              </div>
            </div>
          ) : (
            <PDFViewer
              file={file}
              activeTool={activeTool}
              modifications={modifications}
              onTextChange={handleTextChange}
              onTextLayoutAnalyzed={setPagesTextItems}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
