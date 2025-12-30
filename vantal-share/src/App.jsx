import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  UploadCloud, 
  Download, 
  Monitor, 
  Smartphone, 
  Loader2,
  Power,
  Edit3,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle
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

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function App() {
  const [role, setRole] = useState('home'); 
  const [customId, setCustomId] = useState('');
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  
  // -- File Management --
  const [files, setFiles] = useState([]); 
  const incomingFilesRef = useRef({}); 
  const peerEngine = useRef(null);
  
  // -- Sender Specific --
  const [targetId, setTargetId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [sendingState, setSendingState] = useState('idle'); // idle, waiting_ack, sending, done

  // We need to keep track of the file to send across re-renders for the ACK logic
  const fileToSendRef = useRef(null);

  useEffect(() => {
    loadPeerJS().catch(err => console.error("PeerJS Load Error:", err));
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

    setStatus('Starting Host...');
    setError('');
    
    const Peer = await loadPeerJS();
    const cleanId = customId.trim().replace(/\s+/g, '-').toLowerCase();

    const peer = new Peer(cleanId);

    peer.on('open', (id) => {
      setPeerId(id);
      setStatus('Online');
      setRole('host');
    });

    peer.on('connection', (connection) => {
      setConn(connection);
      
      connection.on('data', (data) => {
        handleIncomingData(data, connection);
      });
      
      connection.on('close', () => {
        setConn(null);
      });
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setError(`"${cleanId}" is taken. Try "${cleanId}-1"`);
      } else {
        setError(`Error: ${err.type}`);
      }
    });

    peerEngine.current = peer;
  };

  const handleIncomingData = (data, connection) => {
    // 1. HEADER: Sender wants to send a file
    if (data.type === 'HEADER') {
      const { id, name, size, type } = data;
      
      // Initialize storage
      incomingFilesRef.current[id] = {
        name,
        size,
        type,
        receivedBytes: 0,
        chunks: [],
        lastUpdate: Date.now()
      };

      // Create UI Card
      setFiles(prev => [{
        id,
        name,
        sizeDisplay: formatBytes(size),
        progress: 0,
        status: 'receiving',
        url: null
      }, ...prev]);

      // CRITICAL: Send ACK back to Sender
      console.log("Header received. Sending ACK.");
      connection.send({ type: 'ACK', id: id });
    } 
    
    // 2. CHUNK: Actual Data
    else if (data.type === 'CHUNK') {
      const { id, chunk } = data;
      const fileMeta = incomingFilesRef.current[id];
      
      if (!fileMeta) return;

      fileMeta.chunks.push(chunk);
      fileMeta.receivedBytes += chunk.byteLength;

      // Throttle UI updates to every 500ms to save performance
      const now = Date.now();
      if (now - fileMeta.lastUpdate > 500 || fileMeta.receivedBytes === fileMeta.size) {
        const percent = Math.min(100, Math.round((fileMeta.receivedBytes / fileMeta.size) * 100));
        
        setFiles(prev => prev.map(f => {
          if (f.id === id) return { ...f, progress: percent };
          return f;
        }));
        fileMeta.lastUpdate = now;
      }

      if (fileMeta.receivedBytes >= fileMeta.size) {
        finalizeFile(id);
      }
    }
  };

  const finalizeFile = (id) => {
    const meta = incomingFilesRef.current[id];
    const blob = new Blob(meta.chunks, { type: meta.type });
    const url = URL.createObjectURL(blob);

    setFiles(prev => prev.map(f => {
      if (f.id === id) {
        return { 
          ...f, 
          status: 'completed', 
          progress: 100,
          url: url 
        };
      }
      return f;
    }));
    
    // Clear chunks from memory to free up RAM, but keep blob URL
    incomingFilesRef.current[id].chunks = []; 
  };

  const destroyHost = () => {
    if (peerEngine.current) peerEngine.current.destroy();
    setRole('home');
    setFiles([]);
    setConn(null);
    setPeerId('');
    setCustomId('');
    incomingFilesRef.current = {};
  };

  // ============================
  // SENDER LOGIC
  // ============================
  const connectToHost = async () => {
    if (!targetId) return;
    setStatus('Connecting...');
    const Peer = await loadPeerJS();
    
    const peer = new Peer(); 
    
    peer.on('open', () => {
      const connection = peer.connect(targetId.trim().toLowerCase().replace(/\s+/g, '-'));
      
      connection.on('open', () => {
        setConn(connection);
        setStatus('Connected');
        setRole('sender');
      });
      
      // Listen for ACKs
      connection.on('data', (data) => {
        if (data.type === 'ACK') {
          console.log("ACK Received. Starting Transfer.");
          startStreamingFile(connection, data.id);
        }
      });

      connection.on('error', () => setStatus('Connection Failed'));
      connection.on('close', () => {
        setStatus('Disconnected');
        setConn(null);
      });
      
      peerEngine.current = peer;
    });
    
    peer.on('error', () => setStatus('Shop not found.'));
  };

  const initiateSend = (e) => {
    const file = e.target.files[0];
    if (!file || !conn) return;

    setCurrentFileName(file.name);
    setUploadProgress(0);
    setSendingState('waiting_ack');
    fileToSendRef.current = file;

    // Unique ID
    const fileId = Math.random().toString(36).substr(2, 9);

    // Send Header and Wait
    conn.send({
      type: 'HEADER',
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type
    });
  };

  const startStreamingFile = (connection, fileId) => {
    setSendingState('sending');
    const file = fileToSendRef.current;
    if (!file) return;

    const CHUNK_SIZE = 16 * 1024; // 16KB
    let offset = 0;

    const sendLoop = () => {
      // Flow Control: Don't flood the connection
      if (connection.dataChannel.bufferedAmount > 10 * 1024 * 1024) {
        // If buffer is over 10MB, wait 50ms and try again
        setTimeout(sendLoop, 50);
        return;
      }

      if (offset >= file.size) {
        setUploadProgress(100);
        setSendingState('done');
        setTimeout(() => {
            setSendingState('idle');
            setUploadProgress(0);
            setCurrentFileName('');
        }, 3000);
        return;
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (!connection.open) return;

        connection.send({
          type: 'CHUNK',
          id: fileId,
          chunk: event.target.result
        });

        offset += CHUNK_SIZE;
        const percent = Math.min(100, Math.round((offset / file.size) * 100));
        setUploadProgress(percent);

        // Keep loop going
        setTimeout(sendLoop, 0); 
      };

      reader.readAsArrayBuffer(slice);
    };

    sendLoop();
  };

  // ============================
  // UI RENDERERS
  // ============================

  if (role === 'home') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="col-span-1 md:col-span-2 text-center mb-4 animate-in fade-in zoom-in-95 duration-700">
            <h1 className="text-5xl font-extrabold tracking-tight mb-2 text-white">
              <span className="text-blue-500">Vantal</span>Share
            </h1>
            <p className="text-slate-400">Mark Cruz's Direct Link System (V4 Robust)</p>
          </div>

          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-xl hover:border-blue-500/50 transition-colors">
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

          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-xl hover:border-emerald-500/50 transition-colors">
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
        <header className="max-w-3xl mx-auto flex items-center justify-between mb-8 sticky top-0 bg-slate-950/80 backdrop-blur-md z-10 py-4">
          <div className="flex items-center space-x-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <Monitor className="w-5 h-5 text-white" />
             </div>
             <div>
                <h1 className="font-bold text-lg leading-none">{customId}</h1>
                <p className="text-xs text-slate-400 flex items-center mt-1">
                   <span className={`w-2 h-2 rounded-full mr-2 ${conn ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
                   {conn ? 'Device Connected' : 'Waiting for Sender...'}
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
           {files.length === 0 && (
             <div className="border-2 border-dashed border-slate-800 rounded-2xl p-20 text-center animate-in fade-in zoom-in-95">
                <Wifi className="w-16 h-16 mx-auto mb-6 text-slate-700" />
                <h3 className="text-2xl font-bold text-slate-700">Ready to Receive</h3>
                <p className="text-slate-500 mt-2">Any files sent to <span className="text-white font-mono">{customId}</span> will appear here.</p>
             </div>
           )}

           {files.map(file => (
             <div key={file.id} className="bg-slate-900 rounded-2xl p-5 border border-slate-800 relative overflow-hidden animate-in slide-in-from-bottom-2">
                <div 
                  className="absolute bottom-0 left-0 h-1 bg-blue-600 transition-all duration-500 ease-out" 
                  style={{ width: `${file.progress}%` }}
                />
                <div className="flex items-center justify-between relative z-10">
                   <div className="flex items-center space-x-4 overflow-hidden">
                      <div className={`p-3 rounded-xl flex-shrink-0 ${file.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}`}>
                         {file.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : <Loader2 className="w-6 h-6 animate-spin" />}
                      </div>
                      <div className="min-w-0">
                         <h3 className="font-bold text-white truncate max-w-[200px] md:max-w-md">{file.name}</h3>
                         <p className="text-xs text-slate-500 font-mono mt-1">
                            {file.status === 'completed' ? 'Transfer Complete' : `Receiving... ${file.progress}%`} • {file.sizeDisplay}
                         </p>
                      </div>
                   </div>

                   {file.status === 'completed' ? (
                     <a 
                       href={file.url} 
                       download={file.name}
                       className="bg-white text-slate-900 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center shadow-lg shadow-white/5"
                     >
                       <Download className="w-4 h-4 mr-2" />
                       Save
                     </a>
                   ) : (
                     <span className="text-sm font-bold text-blue-500">{file.progress}%</span>
                   )}
                </div>
             </div>
           ))}
        </main>
      </div>
    );
  }

  // --- SENDER SCREEN ---
  if (role === 'sender') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans flex flex-col items-center justify-center">
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
              ${sendingState !== 'idle'
                  ? 'border-blue-500 bg-blue-50' 
                  : conn 
                    ? 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-lg hover:-translate-y-1' 
                    : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
               }
            `}>
              <input 
                type="file" 
                className="hidden" 
                onChange={initiateSend} 
                disabled={!conn || sendingState !== 'idle'} 
              />
              
              {sendingState !== 'idle' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
                  <div className="w-24 h-24 relative mb-4">
                     <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * uploadProgress / 100)} transform="rotate(-90 50 50)" className="transition-all duration-300 ease-out" />
                     </svg>
                     <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600 text-xl">{uploadProgress}%</div>
                  </div>
                  <p className="text-sm font-bold text-slate-600 truncate max-w-[80%] px-4">{currentFileName}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {sendingState === 'waiting_ack' ? 'Waiting for Receiver...' : 'Sending Data...'}
                  </p>
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


