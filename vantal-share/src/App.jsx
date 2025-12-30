import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  UploadCloud, 
  Download, 
  FileText, 
  Monitor, 
  Smartphone, 
  Loader2,
  Power,
  Edit3,
  ArrowRight,
  CheckCircle,
  XCircle,
  Terminal,
  Activity,
  Play
} from 'lucide-react';

// --- PeerJS Loader ---
const loadPeerJS = () => {
  return new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const script = document.createElement('script');
    script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
    script.onload = () => resolve(window.Peer);
    script.onerror = () => reject(new Error("Failed to load PeerJS"));
    document.head.appendChild(script);
  });
};

export default function App() {
  const [role, setRole] = useState('home'); 
  const [customId, setCustomId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]); 
  
  // --- Debug State ---
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);

  // Refs
  const peerEngine = useRef(null);
  const incomingBuffer = useRef({}); 

  // --- Sender Specific ---
  const [targetId, setTargetId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [currentFileName, setCurrentFileName] = useState('');

  // --- Logger Helper ---
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
    console.log(`[APP] ${msg}`);
  };

  useEffect(() => {
    loadPeerJS().then(() => addLog("PeerJS Library Loaded")).catch(err => addLog(`PeerJS Load Error: ${err}`));
    return () => {
      if (peerEngine.current) peerEngine.current.destroy();
    };
  }, []);

  // ============================
  // HOST LOGIC (Receiver)
  // ============================
  const startHosting = async () => {
    if (!customId) {
      setError("Please enter a name for your shop.");
      return;
    }
    setStatus('Initializing...');
    addLog(`Starting Host with ID: ${customId}`);
    setError('');
    
    const Peer = await loadPeerJS();
    const cleanId = customId.trim().replace(/\s+/g, '-').toLowerCase();

    const peer = new Peer(cleanId);

    peer.on('open', (id) => {
      setPeerId(id);
      setStatus('Online & Waiting');
      setRole('host');
      addLog(`Host Online. ID: ${id}`);
    });

    peer.on('connection', (connection) => {
      setConn(connection);
      addLog(`New Connection from: ${connection.peer}`);
      
      connection.on('data', (data) => {
        
        // 1. FILE START (The Fix: Explicit Initialization)
        if (data.type === 'file-start') {
          addLog(`Signal: FILE START received for ${data.name}`);
          // Force create buffer
          incomingBuffer.current[data.fileId] = {
            name: data.name,
            size: data.size,
            type: data.mime,
            received: 0,
            chunks: [],
            lastLog: 0,
            startTime: Date.now()
          };
        }
        
        // 2. CHUNK
        else if (data.type === 'stream-chunk') {
          handleStreamChunk(data);
        }
        
        // 3. FILE END
        else if (data.type === 'file-end') {
          addLog(`Signal: FILE END received for ${data.fileId}`);
          finishFile(data.fileId);
        }
      });
      
      connection.on('close', () => {
        setConn(null);
        addLog("Connection Closed");
        incomingBuffer.current = {}; 
      });
    });

    peer.on('error', (err) => {
      addLog(`Peer Error: ${err.type}`);
      if (err.type === 'unavailable-id') {
        setError(`"${cleanId}" is taken. Try "${cleanId}-1"`);
      } else {
        setError(`Error: ${err.type}`);
      }
    });

    peerEngine.current = peer;
  };

  const handleStreamChunk = (data) => {
    const { fileId, chunk } = data;
    
    // Safety: If buffer doesn't exist (missed the start signal?), create it now as fallback
    if (!incomingBuffer.current[fileId]) {
      addLog(`Warning: Received chunk for unknown file ${fileId}. Creating partial buffer.`);
      incomingBuffer.current[fileId] = {
        name: "Unknown File",
        size: 0, 
        type: "application/octet-stream",
        received: 0,
        chunks: [],
        lastLog: 0
      };
    }

    const buffer = incomingBuffer.current[fileId];
    buffer.chunks.push(chunk);
    buffer.received += chunk.byteLength;

    // Detailed Log for the first chunk to prove it arrived
    if (buffer.chunks.length === 1) {
        addLog(`First Chunk Received! Size: ${chunk.byteLength} bytes.`);
    }

    // Log progress every 20%
    if (buffer.size > 0) {
        const percent = Math.floor((buffer.received / buffer.size) * 100);
        if (percent % 20 === 0 && percent !== buffer.lastLog) {
           addLog(`Receiving... ${percent}%`);
           buffer.lastLog = percent;
        }
    }
  };

  const finishFile = (fileId) => {
    const buffer = incomingBuffer.current[fileId];
    
    if (!buffer || buffer.chunks.length === 0) {
        addLog(`CRITICAL: Buffer empty for ${fileId}. Transfer failed.`);
        return;
    }

    addLog(`Finalizing: ${buffer.chunks.length} chunks collected. Total: ${buffer.received} bytes.`);

    try {
        const blob = new Blob(buffer.chunks, { type: buffer.type });
        const url = URL.createObjectURL(blob);
        
        const newFile = {
        id: fileId,
        name: buffer.name,
        size: (buffer.received / 1024).toFixed(1) + ' KB', // Use received size for accuracy
        url: url,
        timestamp: new Date().toLocaleTimeString()
        };

        setFiles(prev => [newFile, ...prev]);
        addLog(`SUCCESS: File ready.`);
        
        // Clear Memory
        delete incomingBuffer.current[fileId];
    } catch (e) {
        addLog(`Blob Error: ${e.message}`);
    }
  };

  const destroyHost = () => {
    if (peerEngine.current) peerEngine.current.destroy();
    setRole('home');
    setFiles([]);
    setConn(null);
    setPeerId('');
    setCustomId('');
    incomingBuffer.current = {};
    setLogs([]);
  };

  // ============================
  // SENDER LOGIC
  // ============================
  const connectToHost = async () => {
    if (!targetId) return;
    setStatus('Connecting...');
    addLog(`Connecting to ${targetId}...`);
    const Peer = await loadPeerJS();
    
    const peer = new Peer(); 
    
    peer.on('open', (myId) => {
      addLog(`My Sender ID: ${myId}`);
      const connection = peer.connect(targetId.trim().toLowerCase().replace(/\s+/g, '-'));
      
      connection.on('open', () => {
        setConn(connection);
        setStatus('Connected');
        setRole('sender');
        addLog(`Connected to Host!`);
      });
      
      connection.on('error', (e) => {
          setStatus('Connection Failed');
          addLog(`Connection Error: ${e}`);
      });
      connection.on('close', () => {
        setStatus('Disconnected');
        setConn(null);
        addLog('Host Disconnected');
      });
      
      peerEngine.current = peer;
    });
    
    peer.on('error', (err) => {
        setStatus('Shop not found.');
        addLog(`Peer Error: ${err.type}`);
    });
  };

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file || !conn) return;

    setCurrentFileName(file.name);
    setUploadProgress(1);
    addLog(`Starting Upload: ${file.name}`);

    const CHUNK_SIZE = 16 * 1024; // 16KB safe chunk
    const fileId = Math.random().toString(36).substr(2, 9);
    let offset = 0;

    // STEP 1: Send Explicit Start Signal
    conn.send({
        type: 'file-start',
        fileId: fileId,
        name: file.name,
        size: file.size,
        mime: file.type
    });

    const sendNextChunk = () => {
      if (offset >= file.size) {
        // STEP 3: Send Final Whistle
        addLog(`Upload Complete. Sending END signal.`);
        conn.send({
            type: 'file-end',
            fileId: fileId
        });
        
        setUploadProgress(100);
        setTimeout(() => {
          setUploadProgress(0);
          setCurrentFileName('');
        }, 2500);
        return;
      }

      // STEP 2: Stream Chunks
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = (event) => {
        if (!conn.open) {
            addLog("Connection lost.");
            return; 
        }

        conn.send({
          type: 'stream-chunk',
          fileId: fileId,
          chunk: event.target.result
        });

        offset += CHUNK_SIZE;
        const percent = Math.min(100, Math.round((offset / file.size) * 100));
        setUploadProgress(percent);

        setTimeout(sendNextChunk, 0);
      };

      reader.readAsArrayBuffer(slice);
    };

    // Small delay to ensure 'file-start' arrives first
    setTimeout(sendNextChunk, 100);
  };

  // ============================
  // UI COMPONENTS
  // ============================

  const DebugConsole = () => (
      <div className={`fixed bottom-0 left-0 right-0 bg-black/95 text-green-400 p-4 font-mono text-xs h-48 overflow-y-auto z-50 transition-transform duration-300 ${showLogs ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex justify-between items-center mb-2 border-b border-green-900 pb-2 sticky top-0 bg-black">
              <span className="font-bold flex items-center"><Terminal className="w-4 h-4 mr-2"/> System Logs</span>
              <button onClick={() => setShowLogs(false)} className="text-red-400 hover:text-white">Close X</button>
          </div>
          <div className="space-y-1">
              {logs.length === 0 && <span className="opacity-50">System ready. Waiting for events...</span>}
              {logs.map((log, i) => (
                  <div key={i} className="break-all border-b border-green-900/30 pb-0.5">{log}</div>
              ))}
          </div>
      </div>
  );

  const LogToggle = () => (
      <button 
        onClick={() => setShowLogs(!showLogs)}
        className="fixed bottom-4 right-4 bg-slate-800 text-slate-400 p-2 rounded-full hover:bg-slate-700 hover:text-white z-40 shadow-lg border border-slate-700"
        title="Toggle Logs"
      >
        <Activity className="w-5 h-5" />
      </button>
  );

  if (role === 'home') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <DebugConsole />
        <LogToggle />
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="col-span-1 md:col-span-2 text-center mb-4 animate-in fade-in zoom-in-95 duration-700">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-white">
              <span className="text-blue-500">Vantal</span>Share
            </h1>
            <p className="text-slate-400">Mark Cruz's Direct Link System (V2.8 Final Fix)</p>
          </div>

          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-xl hover:border-blue-500 transition-colors">
            <div className="flex items-center space-x-4 mb-6">
                <div className="bg-blue-600 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <Monitor className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Receive Files</h2>
                    <p className="text-xs text-slate-400">Host (Shop/Office)</p>
                </div>
            </div>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Create Room Name</label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="e.g. vantal-laoag"
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-4 pr-10 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                            value={customId}
                            onChange={(e) => setCustomId(e.target.value)}
                        />
                        <Edit3 className="w-4 h-4 text-slate-500 absolute right-4 top-4" />
                    </div>
                    {error && <p className="text-red-400 text-xs mt-2 flex items-center"><XCircle className="w-3 h-3 mr-1"/> {error}</p>}
                </div>
                <button 
                    onClick={startHosting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center space-x-2"
                >
                    <span>Start Receiving</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
          </div>

          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-xl hover:border-emerald-500 transition-colors">
             <div className="flex items-center space-x-4 mb-6">
                <div className="bg-emerald-600 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                    <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Send Files</h2>
                    <p className="text-xs text-slate-400">Customer/Client</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Enter Room Name</label>
                    <input
                    type="text"
                    placeholder="e.g. vantal-laoag"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    />
                </div>
                <button 
                  onClick={connectToHost}
                  disabled={!targetId}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
                >
                  Connect
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- HOST SCREEN ---
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
        <DebugConsole />
        <LogToggle />
        <header className="max-w-3xl mx-auto flex items-center justify-between mb-8 sticky top-0 bg-slate-950/90 backdrop-blur-md z-10 py-4 border-b border-slate-800/50">
          <div className="flex items-center space-x-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <Monitor className="w-5 h-5 text-white" />
             </div>
             <div>
                <h1 className="font-bold text-lg leading-none">{customId}</h1>
                <p className="text-xs text-slate-400 flex items-center mt-1">
                   <span className={`w-2 h-2 rounded-full mr-2 ${conn ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
                   {conn ? 'Sender Connected' : 'Waiting for Sender...'}
                </p>
             </div>
          </div>
          <button 
            onClick={destroyHost}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all"
            title="Stop Hosting"
          >
            <Power className="w-5 h-5" />
          </button>
        </header>

        <main className="max-w-3xl mx-auto space-y-4">
           {files.length === 0 ? (
             <div className="border-2 border-dashed border-slate-800 rounded-2xl p-16 text-center animate-in fade-in zoom-in-95">
                <Wifi className="w-16 h-16 mx-auto mb-6 text-slate-700" />
                <h3 className="text-2xl font-bold text-slate-700">Ready to Receive</h3>
                <p className="text-slate-500 mt-2">Files will appear here <span className="text-white">after</span> upload completes.</p>
                <button onClick={() => setShowLogs(true)} className="mt-4 text-xs text-blue-500 underline">Show System Logs</button>
             </div>
           ) : (
             files.map(file => (
               <div key={file.id} className="bg-slate-900 rounded-xl p-4 flex items-center justify-between border border-slate-800 hover:border-blue-500/50 transition-colors animate-in slide-in-from-bottom-2">
                 <div className="flex items-center space-x-4 overflow-hidden">
                   <div className="bg-slate-800 p-3 rounded-lg flex-shrink-0">
                     <FileText className="w-6 h-6 text-blue-400" />
                   </div>
                   <div className="min-w-0">
                     <h3 className="font-bold text-white truncate max-w-[200px]">{file.name}</h3>
                     <p className="text-xs text-slate-500">{file.size} • {file.timestamp}</p>
                   </div>
                 </div>
                 <a 
                   href={file.url} 
                   download={file.name}
                   className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center space-x-2 shadow-lg shadow-blue-900/20"
                 >
                   <Download className="w-4 h-4" />
                   <span>Save</span>
                 </a>
               </div>
             ))
           )}
        </main>
      </div>
    );
  }

  // --- SENDER SCREEN ---
  if (role === 'sender') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans flex flex-col items-center justify-center">
        <DebugConsole />
        <LogToggle />
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${conn ? 'bg-emerald-100' : 'bg-yellow-100'}`}>
              <Wifi className={`w-8 h-8 ${conn ? 'text-emerald-600' : 'text-yellow-600'}`} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
                {conn ? `Connected to ${targetId}` : 'Connecting...'}
            </h2>
          </div>

          <div className="mb-8">
            <label className={`
              relative block w-full aspect-square border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden
              ${uploadProgress > 0 
                  ? 'border-blue-500 bg-blue-50' 
                  : conn 
                    ? 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-lg hover:-translate-y-1' 
                    : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
               }
            `}>
              <input 
                type="file" 
                className="hidden" 
                onChange={sendFile} 
                disabled={!conn || uploadProgress > 0} 
              />
              
              {uploadProgress > 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20">
                  <div className="w-24 h-24 relative mb-4">
                     <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * uploadProgress / 100)} transform="rotate(-90 50 50)" className="transition-all duration-300 ease-out" />
                     </svg>
                     <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600 text-xl">{uploadProgress}%</div>
                  </div>
                  <p className="text-sm font-bold text-slate-800 truncate max-w-[80%] px-4">{currentFileName}</p>
                  
                  {uploadProgress === 100 ? (
                    <p className="text-xs text-green-600 font-bold mt-2 flex items-center animate-bounce">
                      <CheckCircle className="w-3 h-3 mr-1" /> Sent Successfully!
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1 flex items-center">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending... Please Wait
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center p-6">
                  <UploadCloud className={`w-14 h-14 mx-auto mb-4 ${conn ? 'text-slate-400' : 'text-slate-300'}`} />
                  <span className="text-xl font-bold text-slate-700 block">
                    {conn ? 'Tap to Send' : 'Waiting...'}
                  </span>
                  {conn && <span className="text-xs text-slate-400 mt-2 block font-medium">Images • Video • Docs</span>}
                </div>
              )}
            </label>
          </div>

          <button 
            onClick={() => {
                setRole('home');
                setTargetId('');
                setConn(null);
            }}
            className="w-full py-4 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 font-bold transition-colors text-sm"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return null;
}


