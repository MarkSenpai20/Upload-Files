import React, { useState, useEffect } from 'react';
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
  ArrowRight
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

export default function DirectLinkApp() {
  const [role, setRole] = useState('home'); // home, host, sender
  const [customId, setCustomId] = useState(''); // The name you want (e.g., "vantal")
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [status, setStatus] = useState('');
  const [files, setFiles] = useState([]);
  const [peerEngine, setPeerEngine] = useState(null);
  const [error, setError] = useState('');
  
  // Sender specific state
  const [targetId, setTargetId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadPeerJS().catch(err => console.error("PeerJS Load Error:", err));
    return () => {
      if (peerEngine) peerEngine.destroy();
    };
  }, []);

  // --- HOST LOGIC ---
  const startHosting = async () => {
    if (!customId) {
      setError("Please enter a name for your shop.");
      return;
    }

    setStatus('Registering Name...');
    setError('');
    
    const Peer = await loadPeerJS();
    
    // Clean the ID (remove spaces, make lowercase for easier typing)
    // If you type "Vantal Print", it becomes "vantal-print"
    const cleanId = customId.trim().replace(/\s+/g, '-').toLowerCase();

    const peer = new Peer(cleanId, {
      debug: 2
    });

    peer.on('open', (id) => {
      setPeerId(id);
      setStatus('Online & Waiting');
      setRole('host');
    });

    peer.on('connection', (connection) => {
      setConn(connection);
      setStatus(`Connected to: ${connection.peer}`);
      
      connection.on('data', (data) => {
        if (data.type === 'file-chunk') {
          handleReceivedFile(data);
        }
      });
      
      connection.on('close', () => {
        setStatus('Sender disconnected. Waiting...');
        setConn(null);
      });
    });

    peer.on('error', (err) => {
      console.error(err);
      if (err.type === 'unavailable-id') {
        setError(`The name "${cleanId}" is already taken by someone else. Try adding a number (e.g. ${cleanId}-1).`);
        setStatus('');
      } else {
        setStatus(`Error: ${err.type}`);
      }
    });

    setPeerEngine(peer);
  };

  const handleReceivedFile = (data) => {
    const blob = new Blob([data.content], { type: data.mime });
    const url = URL.createObjectURL(blob);
    
    const newFile = {
      id: Date.now(),
      name: data.name,
      size: (data.size / 1024).toFixed(1) + ' KB',
      url: url,
      sender: data.sender || 'Unknown',
      timestamp: new Date().toLocaleTimeString()
    };
    
    setFiles(prev => [newFile, ...prev]);
    setStatus('File Received!');
  };

  const destroyHost = () => {
    if (peerEngine) peerEngine.destroy();
    setRole('home');
    setFiles([]);
    setConn(null);
    setPeerId('');
    setCustomId('');
    setError('');
  };

  // --- SENDER LOGIC ---
  const connectToHost = async () => {
    if (!targetId) return;
    setStatus('Searching for Shop...');
    const Peer = await loadPeerJS();
    
    const peer = new Peer(); 
    
    peer.on('open', () => {
      // Connect to the ID the user typed (convert to lowercase to match host)
      const connection = peer.connect(targetId.trim().toLowerCase().replace(/\s+/g, '-'));
      
      connection.on('open', () => {
        setConn(connection);
        setStatus('Connected!');
        setRole('sender');
      });
      
      connection.on('error', (err) => {
        setStatus('Connection Failed.');
      });

      // If connection closes abruptly
      connection.on('close', () => {
          setStatus('Disconnected from Shop');
          setConn(null);
      });
      
      setPeerEngine(peer);
    });
    
    peer.on('error', (err) => {
      setStatus('Shop not found. Check the spelling.');
    });
  };

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file || !conn) return;

    setStatus(`Sending ${file.name}...`);
    setUploadProgress(10);

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target.result;
      
      conn.send({
        type: 'file-chunk',
        name: file.name,
        mime: file.type,
        size: file.size,
        content: arrayBuffer,
        sender: 'Customer'
      });
      
      setUploadProgress(100);
      setStatus('Sent Successfully!');
      setTimeout(() => {
        setUploadProgress(0);
        setStatus('Ready to send another');
      }, 2000);
    };
    reader.readAsArrayBuffer(file);
  };

  // --- UI RENDER ---

  if (role === 'home') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="col-span-1 md:col-span-2 text-center mb-4 animate-in fade-in slide-in-from-top-4 duration-700">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              <span className="text-blue-500">Direct</span>Link <span className="text-slate-600 text-2xl">V2</span>
            </h1>
            <p className="text-slate-400">Mark's Secure Printing Tunnel</p>
          </div>

          {/* Host Card */}
          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-lg flex flex-col">
            <div className="flex items-center space-x-4 mb-6">
                <div className="bg-blue-500/10 w-12 h-12 rounded-xl flex items-center justify-center">
                    <Monitor className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Create Shop ID</h2>
                    <p className="text-xs text-slate-400">Set the name customers will type</p>
                </div>
            </div>
            
            <div className="mt-auto space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Shop Name</label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="e.g. vantal, angel, mark-print"
                            className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-4 pr-10 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                            value={customId}
                            onChange={(e) => setCustomId(e.target.value)}
                        />
                        <Edit3 className="w-4 h-4 text-slate-500 absolute right-4 top-4" />
                    </div>
                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                </div>

                <button 
                    onClick={startHosting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center space-x-2"
                >
                    <span>Start Hosting</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
          </div>

          {/* Sender Card */}
          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 shadow-lg flex flex-col">
             <div className="flex items-center space-x-4 mb-6">
                <div className="bg-emerald-500/10 w-12 h-12 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Customer Access</h2>
                    <p className="text-xs text-slate-400">Join a shop to send files</p>
                </div>
            </div>

            <div className="mt-auto space-y-4">
                <div>
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Enter Shop Name</label>
                    <input
                    type="text"
                    placeholder="e.g. angel"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
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

  // --- HOST INTERFACE ---
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-6 font-sans">
        <header className="max-w-3xl mx-auto flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${conn ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
            <div>
                 <h1 className="font-bold text-xl leading-none">Shop Dashboard</h1>
                 <p className="text-xs text-slate-500">Host Active</p>
            </div>
          </div>
          <button 
            onClick={destroyHost}
            className="flex items-center space-x-2 text-red-400 hover:text-white hover:bg-red-600 px-4 py-2 rounded-lg transition-all border border-red-900/50"
          >
            <Power className="w-4 h-4" />
            <span>Close Shop</span>
          </button>
        </header>

        <main className="max-w-3xl mx-auto">
          {/* Connection Banner */}
          <div className="bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-800 rounded-2xl p-8 text-center mb-8 shadow-2xl relative overflow-hidden">
             
             <p className="text-blue-300 text-sm uppercase tracking-widest font-bold mb-2">Tell customers to connect to:</p>
             <div 
              className="text-5xl md:text-6xl font-black text-white tracking-tight mb-4 select-all lowercase"
             >
               {peerId || <Loader2 className="w-12 h-12 animate-spin mx-auto opacity-20"/>}
             </div>
             
             <div className="inline-flex items-center bg-black/30 rounded-full px-4 py-1 text-xs text-blue-200 border border-blue-500/30">
               <Wifi className="w-3 h-3 mr-2" />
               {status}
             </div>
          </div>

          {/* Files List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-lg font-bold text-white">Received Files</h2>
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">{files.length} items</span>
            </div>
            
            {files.length === 0 ? (
               <div className="border-2 border-dashed border-slate-800 rounded-2xl p-16 text-center text-slate-600">
                 <UploadCloud className="w-16 h-16 mx-auto mb-4 opacity-20" />
                 <p className="text-lg font-medium text-slate-500">Waiting for files...</p>
                 <p className="text-sm mt-2 opacity-50">Files will appear here automatically.</p>
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
                    <span>Download</span>
                  </a>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- SENDER INTERFACE ---
  if (role === 'sender') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
          
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${conn ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <Wifi className={`w-8 h-8 ${conn ? 'text-green-600' : 'text-yellow-600'}`} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
                {conn ? `Connected to ${targetId}` : 'Connecting...'}
            </h2>
            <p className="text-slate-400 text-sm mt-1">{conn ? 'Secure Tunnel Established' : 'Looking for host...'}</p>
          </div>

          <div className="mb-8">
            <label className={`
              block w-full aspect-square border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
              ${uploadProgress > 0 && uploadProgress < 100 
                  ? 'border-blue-500 bg-blue-50' 
                  : conn 
                    ? 'border-slate-300 hover:border-green-500 hover:bg-green-50 hover:shadow-lg hover:-translate-y-1' 
                    : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
               }
            `}>
              <input 
                type="file" 
                className="hidden" 
                onChange={sendFile} 
                disabled={!conn || (uploadProgress > 0 && uploadProgress < 100)} 
              />
              
              {uploadProgress > 0 && uploadProgress < 100 ? (
                <div className="text-center animate-pulse">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-3" />
                  <span className="text-blue-700 font-bold text-lg">{uploadProgress}% Uploaded</span>
                </div>
              ) : (
                <div className="text-center p-6">
                  <UploadCloud className={`w-14 h-14 mx-auto mb-4 ${conn ? 'text-slate-400' : 'text-slate-300'}`} />
                  <span className="text-xl font-bold text-slate-700 block">
                    {conn ? 'Tap to Send File' : 'Waiting for link...'}
                  </span>
                  {conn && <span className="text-xs text-slate-400 mt-2 block font-medium">Select Image or Document</span>}
                </div>
              )}
            </label>
          </div>

          <div className="text-center space-y-4">
             {status && <div className="text-sm font-medium text-blue-600 bg-blue-50 py-2 rounded-lg">{status}</div>}
             
            <button 
              onClick={() => {
                  setRole('home');
                  setTargetId('');
                  setConn(null);
              }}
              className="text-slate-400 hover:text-red-500 text-sm font-bold transition-colors mt-4"
            >
              Exit / Disconnect
            </button>
          </div>

        </div>
      </div>
    );
  }

  return null;
}


