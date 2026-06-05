import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bold, Italic, Strikethrough, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Table as TableIcon,
  Share2, Moon, Sun, ClipboardPaste, Download, Upload, 
  FileText, Code, FileDown, Printer, X, Plus, Trash2, Feather, Settings, ChevronDown, Sparkles, Loader2
} from 'lucide-react';

// --- Utility Functions for File Conversion ---

const convertHtmlToMarkdown = (html) => {
  if (!html) return '';
  let md = html.replace(/<p>/g, '').replace(/<\/p>/g, '\n\n');
  md = md.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/g, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/g, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/g, '*$1*');
  md = md.replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n');
  md = md.replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n');
  md = md.replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n');
  md = md.replace(/<li>(.*?)<\/li>/g, '- $1\n');
  md = md.replace(/<[^>]*>?/gm, ''); // Strip remaining HTML
  return md.trim();
};

const convertMarkdownToHtml = (md) => {
  if (!md) return '';
  let html = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');
  html = html.replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>'); 
  html = html.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('');
  return html;
};

const stripRtf = (rtf) => {
  if (!rtf) return '';
  return rtf.replace(/\\([a-z]{1,32})(-?\d+)? ?/gi, " ").replace(/[{}]/g, "").trim();
};

const generateRtf = (text) => {
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Inter;}{\\f1\\fnil\\fcharset178 Vazirmatn;}}
{\\*\\generator Sina Write Exporter;}\\viewkind4\\uc1 
\\pard\\sa200\\sl276\\slmult1\\f0\\fs22\\lang9 ${text.replace(/\n/g, '\\par ')}
}`;
};

// --- Main Application ---

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [pasteMode, setPasteMode] = useState('structure');
  const [activeStyles, setActiveStyles] = useState({});
  const [counts, setCounts] = useState({ words: 0, characters: 0 });
  const [inTable, setInTable] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [tableConfig, setTableConfig] = useState({ rows: 3, cols: 3, header: true });
  const [alertMessage, setAlertMessage] = useState(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('ذخیره شد');
  const [isPasteDropdownOpen, setIsPasteDropdownOpen] = useState(false);
  
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const pasteModeRef = useRef(pasteMode);
  const saveTimeoutRef = useRef(null);
  
  useEffect(() => { pasteModeRef.current = pasteMode; }, [pasteMode]);

  // --- Gemini API Logic ---
  const callGemini = async (prompt, systemInstruction = "") => {
    const apiKey = ""; // API key is injected by the environment
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < delays.length + 1; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (error) {
        if (i === delays.length) {
          setAlertMessage("خطا در برقراری ارتباط با هوش مصنوعی. لطفا مجددا تلاش کنید.");
          throw error;
        }
        await new Promise(res => setTimeout(res, delays[i]));
      }
    }
  };

  const handleAiAction = async (actionType) => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    const selectedText = selection.toString();
    const fullText = editorRef.current.innerText || '';
    
    if (actionType === 'polish' && !selectedText.trim()) {
       setAlertMessage("لطفاً برای ویرایش، بخشی از متن را انتخاب کنید. (Please select text to polish)");
       setShowAiModal(false);
       return;
    }

    setIsAiLoading(true);
    setShowAiModal(false);

    try {
      let prompt = "";
      let systemPrompt = "You are a helpful writing assistant embedded in a Persian/English bilingual text editor. Always respond in the same language as the text provided. Do not add conversational filler.";
      
      if (actionType === 'polish') {
        prompt = `Fix any grammar or spelling mistakes, and polish the following text to sound professional:\n\n${selectedText}`;
      } else if (actionType === 'continue') {
        const contextText = selectedText || fullText.slice(-1000); 
        prompt = `Continue writing the following text naturally. Maintain the exact same language (Persian or English), tone, and style. Only output the continuation:\n\n${contextText}`;
      } else if (actionType === 'summarize') {
        prompt = `Provide a concise summary of the following text in its original language. Format it nicely. Only output the summary:\n\n${fullText}`;
      }

      const responseText = await callGemini(prompt, systemPrompt);
      
      if (responseText) {
        editorRef.current.focus();
        if (actionType === 'polish') {
          document.execCommand('insertText', false, responseText.trim());
        } else if (actionType === 'continue') {
          document.execCommand('insertText', false, " " + responseText.trim());
        } else if (actionType === 'summarize') {
          const summaryHtml = `<br><br><strong>✨ خلاصه / Summary:</strong><br>${convertMarkdownToHtml(responseText)}<br>`;
          document.execCommand('insertHTML', false, summaryHtml);
        }
        updateCounts();
      }
    } catch (error) {
      console.error("Gemini AI Action Failed:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Initialization: Fonts, PWA Manifest, Dark Mode
  useEffect(() => {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const manifest = {
      name: "Sina Write",
      short_name: "Sina Write",
      description: "Sina's Personal Text Editor",
      start_url: ".",
      display: "standalone",
      background_color: isDark ? "#030712" : "#ffffff",
      theme_color: "#4f46e5",
      icons: [{ src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234f46e5'%3E%3Cpath d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/%3E%3C/svg%3E", sizes: "192x192", type: "image/svg+xml" }]
    };
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
    document.head.appendChild(manifestLink);
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) setIsDark(true);
    
    return () => {
      document.head.removeChild(fontLink);
      document.head.removeChild(manifestLink);
    };
  }, []);

  // Selection tracking for active states and context menus
  useEffect(() => {
    const handleSelection = () => {
      if (!editorRef.current || !document.activeElement || !editorRef.current.contains(document.activeElement)) return;
      
      setActiveStyles({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strike: document.queryCommandState('strikeThrough'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });

      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        setInTable(!!node.closest('table'));
      }
    };
    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  // Initialization: Load Draft from LocalStorage
  useEffect(() => {
    const savedDraft = localStorage.getItem('sina_write_draft');
    if (savedDraft && editorRef.current) {
      editorRef.current.innerHTML = savedDraft;
      // Initial count update
      const text = editorRef.current.innerText || '';
      const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(w => w.length > 0).length;
      setCounts({ words, characters: text.length });
    }
  }, []);

  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const html = editorRef.current.innerHTML || '';
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(w => w.length > 0).length;
    setCounts({ words, characters: text.length });

    // Auto-save logic
    setSaveStatus('در حال ذخیره...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('sina_write_draft', html);
      setSaveStatus('ذخیره شد');
    }, 1000); // 1-second debounce to optimize performance
  }, []);

  const execCmd = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    document.dispatchEvent(new Event('selectionchange'));
    updateCounts();
  };

  // --- Table Handling ---
  const insertTable = () => {
    editorRef.current?.focus();
    let tableHTML = `<table class="sina-table" style="width: 100%; border-collapse: collapse; margin: 1.5em 0; border: 1px solid #d1d5db;">`;
    
    if (tableConfig.header) {
      tableHTML += `<thead><tr>`;
      for(let i=0; i<tableConfig.cols; i++) tableHTML += `<th style="border: 1px solid #d1d5db; padding: 0.75rem; background-color: #f3f4f6; text-align: start; font-weight: 600;">Header ${i+1}</th>`;
      tableHTML += `</tr></thead>`;
    }
    
    tableHTML += `<tbody>`;
    for(let r=0; r<tableConfig.rows; r++) {
      tableHTML += `<tr>`;
      for(let c=0; c<tableConfig.cols; c++) tableHTML += `<td style="border: 1px solid #d1d5db; padding: 0.75rem;"><br></td>`;
      tableHTML += `</tr>`;
    }
    tableHTML += `</tbody></table><p><br></p>`;
    
    document.execCommand('insertHTML', false, tableHTML);
    setShowTableModal(false);
    updateCounts();
  };

  const handleTableAction = (action) => {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    let node = selection.anchorNode;
    if (node.nodeType === 3) node = node.parentNode;
    
    const td = node.closest('td, th');
    const tr = node.closest('tr');
    const table = node.closest('table');
    if (!td || !tr || !table) return;

    if (action === 'addRow') {
      const newRow = tr.cloneNode(true);
      Array.from(newRow.cells).forEach(cell => cell.innerHTML = '<br>');
      tr.parentNode.insertBefore(newRow, tr.nextSibling);
    } else if (action === 'addCol') {
      const index = Array.from(tr.cells).indexOf(td);
      Array.from(table.rows).forEach(row => {
        const newCell = row.cells[index].cloneNode(false);
        newCell.innerHTML = '<br>';
        row.insertBefore(newCell, row.cells[index].nextSibling);
      });
    } else if (action === 'delRow') {
      tr.remove();
      if (table.rows.length === 0) table.remove();
    } else if (action === 'delCol') {
      const index = Array.from(tr.cells).indexOf(td);
      Array.from(table.rows).forEach(row => {
        if (row.cells[index]) row.cells[index].remove();
      });
      if (table.rows[0]?.cells.length === 0) table.remove();
    }
    updateCounts();
  };

  // --- File Handling ---
  const handlePaste = (e) => {
    e.preventDefault();
    const mode = pasteModeRef.current;
    let html = e.clipboardData.getData('text/html');
    let text = e.clipboardData.getData('text/plain');

    if (mode === 'plain' || !html) {
      document.execCommand('insertText', false, text);
    } else if (mode === 'structure') {
      const sanitizedHtml = html.replace(/ style="[^"]*"/gi, '').replace(/ class="[^"]*"/gi, '').replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '');
      document.execCommand('insertHTML', false, sanitizedHtml);
    } else {
      document.execCommand('insertHTML', false, html);
    }
    setTimeout(updateCounts, 0);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      const ext = file.name.split('.').pop().toLowerCase();
      let html = '';
      if (ext === 'md') html = convertMarkdownToHtml(content);
      else if (ext === 'rtf') html = `<p>${stripRtf(content)}</p>`;
      else html = content.split('\n').map(line => `<p>${line}</p>`).join('');
      
      if (editorRef.current) {
        editorRef.current.innerHTML = html;
        updateCounts();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = (format) => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const html = editorRef.current.innerHTML || '';
    
    const download = (filename, content, type) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    switch(format) {
      case 'txt': download('SinaWrite-Doc.txt', text, 'text/plain'); break;
      case 'html': download('SinaWrite-Doc.html', `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>Sina Write Document</title></head><body>${html}</body></html>`, 'text/html'); break;
      case 'md': download('SinaWrite-Doc.md', convertHtmlToMarkdown(html), 'text/markdown'); break;
      case 'rtf': download('SinaWrite-Doc.rtf', generateRtf(text), 'application/rtf'); break;
      case 'pdf': setTimeout(() => window.print(), 300); break;
      default: break;
    }
    setShowExportModal(false);
  };

  const shareFile = async () => {
    if (!editorRef.current) return;
    const textContent = editorRef.current.innerText || '';

    if (!navigator.share) {
      setAlertMessage("قابلیت اشتراک‌گذاری مستقیم فایل، فقط در گوشی موبایل پشتیبانی می‌شود.");
      return;
    }

    try {
      const file = new File([textContent], 'SinaWrite-Doc.txt', { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Sina Write Document',
        });
      } else {
        await navigator.share({ title: 'Sina Write Document', text: textContent });
      }
    } catch (err) { 
      console.log('Share canceled or failed', err);
      if (err.name !== 'AbortError') {
        setAlertMessage("قابلیت اشتراک‌گذاری مستقیم فایل، فقط در گوشی موبایل پشتیبانی می‌شود.");
      }
    }
  };

  const pasteOptions = [
    { value: 'full', label: 'Keep Full Format' },
    { value: 'structure', label: 'Match Editor Style' },
    { value: 'plain', label: 'Plain Text Only' }
  ];

  // --- UI Sub-Components ---
  const ToolbarButton = ({ onClick, isActive, icon: Icon, title, className = "" }) => (
    <button
      onClick={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-8 h-8 p-1.5 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 ${
        isActive 
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 shadow-inner' 
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800'
      } active:scale-95 ${className}`}
    >
      <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
    </button>
  );

  return (
    <div className={`min-h-screen transition-colors duration-300 flex flex-col font-sans ${isDark ? 'dark bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Editor Core Styling */}
      <style dangerouslySetInnerHTML={{__html: `
        :root { --editor-font: 'Vazirmatn', 'Inter', ui-sans-serif, system-ui, sans-serif; }
        
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .editor-content {
          min-height: calc(100vh - 220px);
          padding: 1.5rem; outline: none;
          font-family: var(--editor-font);
          font-size: 16px; line-height: 1.625;
          word-wrap: break-word; white-space: pre-wrap; overflow-wrap: break-word;
          direction: rtl; 
          text-align: right; 
        }
        
        .editor-content p, .editor-content h1, .editor-content h2, .editor-content h3, 
        .editor-content li, .editor-content div, .editor-content table, .editor-content td, .editor-content th {
          direction: rtl; 
          text-align: start; 
          unicode-bidi: plaintext; 
          margin-bottom: 0.75em;
          max-width: 100%;
        }

        .editor-content h1 { font-size: 2em; font-weight: 700; margin-top: 1.5em; }
        .editor-content h2 { font-size: 1.5em; font-weight: 600; margin-top: 1.25em; }
        .editor-content h3 { font-size: 1.25em; font-weight: 600; margin-top: 1em; }
        .editor-content ul { list-style-type: disc; padding-inline-start: 1.5em; padding-inline-end: 1.5em; }
        .editor-content ol { list-style-type: decimal; padding-inline-start: 1.5em; padding-inline-end: 1.5em; }
        .editor-content a { color: #4f46e5; text-decoration: underline; }
        
        .editor-content[contenteditable="true"]:empty::before {
          content: attr(data-placeholder);
          color: ${isDark ? '#4b5563' : '#9ca3af'};
          pointer-events: none; display: block;
        }
        
        .editor-content table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 1.5em 0; overflow: hidden; }
        .editor-content td, .editor-content th { border: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; padding: 0.75rem; vertical-align: top; word-wrap: break-word; }
        .editor-content th { background-color: ${isDark ? '#1f2937' : '#f9fafb'}; font-weight: 600; }
        .dark .editor-content th[style*="background-color"] { background-color: #1f2937 !important; }
        .dark .editor-content td, .dark .editor-content th { border-color: #374151 !important; }

        @media print { .no-print { display: none !important; } .editor-content { padding: 0; } body { background: white; color: black; } }
      `}} />

      {/* Main Header */}
      <header dir="rtl" className="no-print sticky top-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="flex flex-col mb-3 sm:mb-0">
          <h1 className="flex items-center gap-2.5">
            <Feather className="w-7 h-7 text-orange-500 drop-shadow-sm" strokeWidth={2.5} />
            <div dir="ltr" className="flex items-baseline font-extrabold tracking-tight">
              <span className="text-4xl text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">S</span>
              <span className="text-3xl text-gray-900 dark:text-white mr-1.5">ina</span>
              <span className="text-4xl text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">W</span>
              <span className="text-3xl text-gray-900 dark:text-white">rite</span>
            </div>
          </h1>
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-gray-500 dark:text-gray-400 mr-10 mt-0.5 opacity-90">
            Sina's Personal Text Editor
          </span>
        </div>
        
        <div dir="ltr" className="flex items-center gap-2 self-end sm:self-auto">
          <button onClick={() => setIsDark(!isDark)} className="p-2 bg-gray-200/40 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-xl hover:text-orange-500 hover:bg-orange-500/10 dark:hover:text-orange-500 transition-colors" title="Toggle Dark Mode">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <input type="file" ref={fileInputRef} onChange={handleImport} accept=".txt,.rtf,.md" className="hidden" />
          
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-200/40 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-xl hover:text-orange-500 hover:bg-orange-500/10 dark:hover:text-orange-500 transition-colors">
            <Upload size={16} /> <span className="hidden md:inline">Import</span>
          </button>
          
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-200/40 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-xl hover:text-orange-500 hover:bg-orange-500/10 dark:hover:text-orange-500 transition-colors">
            <Download size={16} /> <span className="hidden md:inline">Export</span>
          </button>

          <button onClick={shareFile} className="flex items-center justify-center p-2 bg-gray-200/40 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-xl hover:text-orange-500 hover:bg-orange-500/10 dark:hover:text-orange-500 transition-colors" title="Share via Device">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      {/* Editor Body */}
      <main className="flex-1 w-full max-w-4xl mx-auto flex flex-col relative z-0 mt-4 px-2 sm:px-0">
        
        {/* Toolbar */}
        <div dir="rtl" className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm z-10 sticky top-[72px] sm:top-[80px]">
          
          {/* Text Formatting - Responsive Auto-Spacing Toolbar */}
          <div className="w-full flex justify-between items-center sm:w-auto flex-1 gap-1">
            
            {/* Group 1: Text Styles */}
            <div className="flex items-center gap-0.5 bg-gray-200/50 dark:bg-gray-800/60 border border-gray-300/50 dark:border-gray-700/50 rounded-lg p-0.5 shrink-0">
              <ToolbarButton icon={Bold} onClick={() => execCmd('bold')} isActive={activeStyles.bold} title="Bold" />
              <ToolbarButton icon={Italic} onClick={() => execCmd('italic')} isActive={activeStyles.italic} title="Italic" />
              <ToolbarButton icon={Strikethrough} onClick={() => execCmd('strikeThrough')} isActive={activeStyles.strike} title="Strike" />
            </div>
            
            {/* Group 2: Alignments */}
            <div className="flex items-center gap-0.5 bg-gray-200/50 dark:bg-gray-800/60 border border-gray-300/50 dark:border-gray-700/50 rounded-lg p-0.5 shrink-0">
              <ToolbarButton icon={AlignRight} onClick={() => execCmd('justifyRight')} isActive={activeStyles.justifyRight} title="Align Right (RTL - Persian)" />
              <ToolbarButton icon={AlignCenter} onClick={() => execCmd('justifyCenter')} isActive={activeStyles.justifyCenter} title="Align Center" />
              <ToolbarButton icon={AlignLeft} onClick={() => execCmd('justifyLeft')} isActive={activeStyles.justifyLeft} title="Align Left (LTR - English)" />
            </div>
            
            {/* Group 3: Lists */}
            <div className="flex items-center gap-0.5 bg-gray-200/50 dark:bg-gray-800/60 border border-gray-300/50 dark:border-gray-700/50 rounded-lg p-0.5 shrink-0">
              <ToolbarButton icon={List} onClick={() => execCmd('insertUnorderedList')} isActive={activeStyles.insertUnorderedList} title="Bullet List" />
              <ToolbarButton icon={ListOrdered} onClick={() => execCmd('insertOrderedList')} isActive={activeStyles.insertOrderedList} title="Numbered List" />
            </div>
            
            {/* Group 4: Table */}
            <div className="flex items-center gap-0.5 bg-gray-200/50 dark:bg-gray-800/60 border border-gray-300/50 dark:border-gray-700/50 rounded-lg p-0.5 shrink-0">
              <ToolbarButton icon={TableIcon} onClick={() => setShowTableModal(true)} title="Insert Custom Table" />
            </div>

          </div>

          {/* Unified Toolset Row (Paste Mode & AI) - Swapped & Proportioned */}
          <div dir="rtl" className="flex flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
            
            {/* Paste Control Custom Dropdown - 2/3 width */}
            <div className="relative w-2/3 sm:w-48 h-10 z-50" dir="ltr">
              <button 
                onClick={() => setIsPasteDropdownOpen(!isPasteDropdownOpen)}
                className="w-full h-full flex items-center justify-between bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs sm:text-sm font-medium transition-colors shadow-sm"
              >
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <ClipboardPaste size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
                  <span className="truncate">{pasteOptions.find(o => o.value === pasteMode)?.label}</span>
                </div>
                <ChevronDown size={14} className={`text-gray-400 dark:text-gray-500 transition-transform shrink-0 ${isPasteDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isPasteDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsPasteDropdownOpen(false)}></div>
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden text-sm animate-in fade-in slide-in-from-top-1">
                    {pasteOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setPasteMode(option.value);
                          setIsPasteDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          pasteMode === option.value
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 font-semibold'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* AI Features Button - 1/3 width */}
            <button 
              onClick={() => setShowAiModal(true)}
              dir="ltr"
              className="flex w-1/3 sm:w-auto items-center justify-center gap-1.5 px-2 h-10 bg-white dark:bg-gray-800 border border-purple-500/50 rounded-lg hover:bg-purple-500/10 dark:hover:bg-purple-500/20 transition-all shadow-sm active:scale-95 group overflow-hidden"
            >
              {isAiLoading ? (
                <Loader2 size={16} className="animate-spin text-violet-600 dark:text-violet-400 shrink-0" />
              ) : (
                <Sparkles size={16} className="text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform shrink-0" />
              )}
              <span className="text-xs sm:text-sm font-semibold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-violet-400 dark:to-fuchsia-400 truncate">
                AI Assistant
              </span>
            </button>
            
          </div>
        </div>

        {/* Contextual Table Toolbar (Appears only when inside a table) */}
        {inTable && (
          <div className="no-print mt-2 flex flex-wrap items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50 animate-in fade-in slide-in-from-top-2">
            <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 px-2 flex items-center gap-1"><Settings size={14}/> Table Tools:</span>
            <button onClick={() => handleTableAction('addRow')} className="px-2 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1"><Plus size={12}/> Row Below</button>
            <button onClick={() => handleTableAction('addCol')} className="px-2 py-1 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1"><Plus size={12}/> Col Next</button>
            <button onClick={() => handleTableAction('delRow')} className="px-2 py-1 text-xs font-medium text-red-600 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-red-50 flex items-center gap-1"><Trash2 size={12}/> Row</button>
            <button onClick={() => handleTableAction('delCol')} className="px-2 py-1 text-xs font-medium text-red-600 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-red-50 flex items-center gap-1"><Trash2 size={12}/> Col</button>
          </div>
        )}
        
        {/* The Editor Area */}
        <div 
          className="flex-1 mt-4 bg-white dark:bg-gray-900 shadow-sm rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden" 
          onClick={() => editorRef.current?.focus()}
        >
          <div 
            ref={editorRef}
            contentEditable={true}
            dir="rtl"
            className="editor-content w-full h-full"
            suppressContentEditableWarning={true}
            data-placeholder="شروع به نوشتن کنید..."
            onInput={updateCounts}
            onPaste={handlePaste}
            onKeyUp={updateCounts}
          />
        </div>
      </main>

      {/* Status Bar */}
      <footer className="no-print sticky bottom-0 z-10 mt-6 flex items-center justify-between px-5 py-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 text-xs font-medium shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400" dir="rtl">
          <span className="relative flex h-2.5 w-2.5">
            {saveStatus === 'در حال ذخیره...' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${saveStatus === 'ذخیره شد' ? 'bg-green-500' : 'bg-indigo-500'}`}></span>
          </span>
          <span>{saveStatus}</span>
        </div>
        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          <span>{counts.words} Words</span>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
          <span>{counts.characters} Chars</span>
        </div>
      </footer>

      {/* --- Modals --- */}
      
      {/* Table Configuration Modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold">Insert Table</h3>
              <button onClick={() => setShowTableModal(false)} className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Rows</label>
                <input type="number" min="1" max="20" value={tableConfig.rows} onChange={e=>setTableConfig({...tableConfig, rows: parseInt(e.target.value) || 1})} className="w-20 p-2 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Columns</label>
                <input type="number" min="1" max="20" value={tableConfig.cols} onChange={e=>setTableConfig({...tableConfig, cols: parseInt(e.target.value) || 1})} className="w-20 p-2 text-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="headerRow" checked={tableConfig.header} onChange={e=>setTableConfig({...tableConfig, header: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                <label htmlFor="headerRow" className="text-sm font-medium cursor-pointer">Include Header Row</label>
              </div>
              <button onClick={insertTable} className="w-full mt-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-500/20">
                Create Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Options Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold">Export Document</h3>
              <button onClick={() => setShowExportModal(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 grid gap-2">
              <button onClick={() => handleExport('txt')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
                <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-2 rounded-lg"><FileText size={20} /></div>
                <div><div className="font-semibold text-sm">Plain Text (.txt)</div><div className="text-xs text-gray-500">Raw text without formatting</div></div>
              </button>
              <button onClick={() => handleExport('rtf')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg"><FileDown size={20} /></div>
                <div><div className="font-semibold text-sm">Rich Text Format (.rtf)</div><div className="text-xs text-gray-500">Compatible with MS Word</div></div>
              </button>
              <button onClick={() => handleExport('md')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
                <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 p-2 rounded-lg"><Code size={20} /></div>
                <div><div className="font-semibold text-sm">Markdown (.md)</div><div className="text-xs text-gray-500">Standard markdown syntax</div></div>
              </button>
              <button onClick={() => handleExport('html')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
                <div className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-2 rounded-lg"><Code size={20} /></div>
                <div><div className="font-semibold text-sm">Web Page (.html)</div><div className="text-xs text-gray-500">Preserves all exact styling</div></div>
              </button>
              <button onClick={() => handleExport('pdf')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
                <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-lg"><Printer size={20} /></div>
                <div><div className="font-semibold text-sm">PDF Document (.pdf)</div><div className="text-xs text-gray-500">Print or save as PDF</div></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Message Modal */}
      {alertMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200 p-6 text-center">
            <p className="text-gray-800 dark:text-gray-200 font-medium mb-6 text-base leading-relaxed" dir="rtl">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all"
            >
              تایید (OK)
            </button>
          </div>
        </div>
      )}

      {/* AI Features Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-lg font-bold flex items-center gap-2 text-violet-600 dark:text-violet-400">
                <Sparkles size={20} /> AI Assistant
              </h3>
              <button onClick={() => setShowAiModal(false)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 grid gap-3">
              <button onClick={() => handleAiAction('continue')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/30 text-left transition-colors border border-gray-200 dark:border-gray-700 group">
                <div className="text-2xl group-hover:scale-110 transition-transform">✨</div>
                <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Continue Writing</div><div className="text-xs text-gray-500">Auto-completes based on your text</div></div>
              </button>
              <button onClick={() => handleAiAction('polish')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30 text-left transition-colors border border-gray-200 dark:border-gray-700 group">
                <div className="text-2xl group-hover:scale-110 transition-transform">✨</div>
                <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Polish Selected Text</div><div className="text-xs text-gray-500">Fixes grammar & improves professional tone</div></div>
              </button>
              <button onClick={() => handleAiAction('summarize')} className="flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left transition-colors border border-gray-200 dark:border-gray-700 group">
                <div className="text-2xl group-hover:scale-110 transition-transform">✨</div>
                <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Summarize</div><div className="text-xs text-gray-500">Appends a summary to the end of the document</div></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global AI Loading Overlay to prevent edits while generating */}
      {isAiLoading && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-4 bg-white/60 dark:bg-black/60 backdrop-blur-sm">
          <Loader2 size={48} className="animate-spin text-violet-600 mb-4" />
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 animate-pulse">✨ AI is thinking... ✨</p>
        </div>
      )}
    </div>
  );
}