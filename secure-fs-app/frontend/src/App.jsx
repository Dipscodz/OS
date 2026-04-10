import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Shield, Upload, FileText, Settings, LogOut, Users, Download, Share2, Database, Key } from 'lucide-react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const API_URL = 'http://localhost:3001';

const authenticate = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const decoded = jwtDecode(token);
    if (decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/login' : '/register';
      const res = await axios.post(`${API_URL}${endpoint}`, { username, password });
      
      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        navigate('/dashboard');
      } else {
        setIsLogin(true);
        setError('Registration successful. Please login.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="glass" style={{ padding: '40px', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <Shield size={48} color="var(--primary)" style={{ marginBottom: '20px' }} />
        <h2 style={{ marginBottom: '30px', fontSize: '24px' }}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '15px', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="input-field"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn" style={{ width: '100%' }}>
            {isLogin ? 'Login Securely' : 'Register securely'}
          </button>
        </form>
        <p style={{ marginTop: '20px', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => { setIsLogin(!isLogin); setError(''); }}>
          {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
        </p>
      </div>
    </div>
  );
};

const UserDashboard = ({ user, onLogout }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [shareTarget, setShareTarget] = useState('');
  const [sharingFileId, setSharingFileId] = useState(null);
  const fileInputRef = useRef(null);

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/files`, { headers: { Authorization: `Bearer ${token}` } });
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/files`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      fetchFiles();
    } catch (err) {
      alert('Upload failed: ' + err.response?.data?.error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = (id, filename) => {
    const token = localStorage.getItem('token');
    window.location.href = `${API_URL}/files/${id}/download?token=${token}`;
    // A more secure way in real world is using blob, but window.location with token or temporary access link works for simple setups.
    // Let's use fetch object instead to pass auth headers securely.
    axios.get(`${API_URL}/files/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
    }).then(res => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
    }).catch(err => alert("Download failed"));
  };

  const handleShare = async (e) => {
    e.preventDefault();
    try {
       const token = localStorage.getItem('token');
       await axios.post(`${API_URL}/files/${sharingFileId}/share`, { targetUsername: shareTarget }, {
           headers: { Authorization: `Bearer ${token}` }
       });
       alert('File shared successfully!');
       setSharingFileId(null);
       setShareTarget('');
    } catch (err) {
       alert('Share failed: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '32px' }}>My Vault</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Securely encrypted files for {user.username}</p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleUpload} />
            <button className="btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
            <Upload size={18} /> {isUploading ? 'Encrypting...' : 'Secure Upload'}
            </button>
            {user.role === 'admin' && (
                <button className="btn btn-secondary" onClick={() => window.location.href='/admin'}>
                    <Settings size={18} /> Admin
                </button>
            )}
        </div>
      </div>

      {sharingFileId && (
          <div className="glass" style={{ padding: '20px', marginBottom: '30px' }}>
              <h3>Share File</h3>
              <form onSubmit={handleShare} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <input type="text" className="input-field" style={{ marginBottom: 0 }} placeholder="Recipient Username" value={shareTarget} onChange={(e) => setShareTarget(e.target.value)} required />
                  <button type="submit" className="btn">Share</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSharingFileId(null)}>Cancel</button>
              </form>
          </div>
      )}

      <div className="glass" style={{ padding: '30px' }}>
        <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={20} className="gradient-text"/> Your Files & Activity
        </h3>
        {files.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No files found. Upload something secure!</p>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Filename</th>
                        <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Owner</th>
                        <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Size</th>
                        <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {files.map(file => (
                        <tr key={file.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileText size={18} color="var(--primary)" /> {file.filename}
                            </td>
                            <td style={{ padding: '16px 12px' }}>
                                {file.is_owner ? 'Me' : file.owner_name}
                            </td>
                            <td style={{ padding: '16px 12px' }}>
                                {(file.size / 1024).toFixed(2)} KB
                            </td>
                            <td style={{ padding: '16px 12px', display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => handleDownload(file.id, file.filename)}>
                                    <Download size={14} />
                                </button>
                                {file.is_owner === 1 && (
                                     <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setSharingFileId(file.id)}>
                                        <Share2 size={14} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

const AdminDashboard = ({ user }) => {
    const [stats, setStats] = useState({ users: 0, files: 0, total_size: 0 });
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        const fetchGlobalData = async () => {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            
            try {
                const statsRes = await axios.get(`${API_URL}/admin/stats`, { headers });
                setStats(statsRes.data);

                const logsRes = await axios.get(`${API_URL}/admin/logs`, { headers });
                setLogs(logsRes.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchGlobalData();
    }, []);

    if (user.role !== 'admin') return <Navigate to="/dashboard" />;

    return (
        <div className="container animate-fade-in">
            <h1 className="gradient-text" style={{ fontSize: '32px', marginBottom: '30px' }}>System Admin</h1>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '40px' }}>
                <div className="glass" style={{ padding: '24px', textAlign: 'center' }}>
                    <Users size={32} color="var(--primary)" style={{ marginBottom: '10px' }} />
                    <h3>{stats.users}</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Registered Users</p>
                </div>
                <div className="glass" style={{ padding: '24px', textAlign: 'center' }}>
                    <FileText size={32} color="var(--accent)" style={{ marginBottom: '10px' }} />
                    <h3>{stats.files}</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Encrypted Files</p>
                </div>
                <div className="glass" style={{ padding: '24px', textAlign: 'center' }}>
                    <Database size={32} color="var(--success)" style={{ marginBottom: '10px' }} />
                    <h3>{(stats.total_size / 1024 / 1024).toFixed(2)} MB</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Disk Usage</p>
                </div>
            </div>

            <div className="glass" style={{ padding: '30px' }}>
                <h3 style={{ marginBottom: '20px' }}>Audit Logs</h3>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {logs.map(log => (
                        <div key={log.id} style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <span style={{ color: 'var(--primary)', fontWeight: 500 }}>[{log.action}]</span>
                                <span style={{ marginLeft: '10px' }}>User <b>{log.username}</b> ({log.user_id})</span>
                                {log.details && <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>- {log.details}</span>}
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = authenticate();
    if (auth) setUser(auth);
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  if (loading) return null;

  return (
    <Router>
      <div className="nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '20px' }}>
              <Shield color="var(--primary)" /> 
              <span className="gradient-text">CrypFS</span>
          </div>
          {user && (
              <button className="btn btn-secondary" onClick={handleLogout}>
                  <LogOut size={16} /> Logout
              </button>
          )}
      </div>

      <Routes>
        <Route path="/login" element={!user ? <AuthPage /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={user ? <UserDashboard user={user} /> : <Navigate to="/login" />} />
        <Route path="/admin" element={user ? <AdminDashboard user={user} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
