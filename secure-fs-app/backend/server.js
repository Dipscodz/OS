const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { db, initDb, logAction } = require('./database');
const { encryptFile, getDecipherStream } = require('./encryption');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'super_secret_jwt_key_for_mini_fs';
const STORAGE_DIR = path.join(__dirname, 'storage');
const TEMP_DIR = path.join(__dirname, 'temp');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

initDb();

const upload = multer({ dest: TEMP_DIR });

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Username may already exist' });
        logAction(this.lastID, 'REGISTER', this.lastID);
        res.json({ success: true, message: 'User registered successfully' });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        logAction(user.id, 'LOGIN', user.id);
        res.json({ token, role: user.role, username: user.username });
    });
});

app.post('/files', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tempPath = req.file.path;
    const savePath = path.join(STORAGE_DIR, req.file.filename);

    try {
        const ivHex = await encryptFile(tempPath, savePath);
        fs.unlinkSync(tempPath);

        db.run("INSERT INTO files (owner_id, filename, disk_path, iv, size) VALUES (?, ?, ?, ?, ?)",
            [req.user.id, req.file.originalname, req.file.filename, ivHex, req.file.size],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                logAction(req.user.id, 'UPLOAD', this.lastID);
                res.json({ success: true, fileId: this.lastID });
            }
        );
    } catch (error) {
        if(fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(500).json({ error: 'Encryption failed' });
    }
});

app.get('/files', authenticateToken, (req, res) => {
    const query = `
        SELECT f.*, u.username as owner_name, 
        CASE WHEN f.owner_id = ? THEN 1 ELSE 0 END as is_owner
        FROM files f
        LEFT JOIN users u ON f.owner_id = u.id
        LEFT JOIN permissions p ON p.file_id = f.id
        WHERE f.owner_id = ? OR p.user_id = ?
        GROUP BY f.id
    `;
    db.all(query, [req.user.id, req.user.id, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/files/:id/download', authenticateToken, (req, res) => {
    const fileId = req.params.id;

    db.get("SELECT f.* FROM files f LEFT JOIN permissions p ON p.file_id = f.id WHERE f.id = ? AND (f.owner_id = ? OR p.user_id = ?)",
        [fileId, req.user.id, req.user.id],
        (err, file) => {
            if (err || !file) return res.status(403).json({ error: 'Access denied or file not found' });

            const diskPath = path.join(STORAGE_DIR, file.disk_path);
            if (!fs.existsSync(diskPath)) return res.status(404).json({ error: 'File missing on disk' });

            logAction(req.user.id, 'DOWNLOAD', file.id);

            res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
            
            const readStream = fs.createReadStream(diskPath);
            const decipherStream = getDecipherStream(file.iv);
            
            readStream.pipe(decipherStream).pipe(res);
        }
    );
});

app.post('/files/:id/share', authenticateToken, (req, res) => {
    const fileId = req.params.id;
    const { targetUsername } = req.body;

    db.get("SELECT * FROM files WHERE id = ? AND owner_id = ?", [fileId, req.user.id], (err, file) => {
        if (!file) return res.status(403).json({ error: 'Not the owner' });

        db.get("SELECT id FROM users WHERE username = ?", [targetUsername], (err, targetUser) => {
            if (!targetUser) return res.status(404).json({ error: 'User not found' });

            db.run("INSERT OR IGNORE INTO permissions (file_id, user_id, permission_type) VALUES (?, ?, 'read')",
                [file.id, targetUser.id],
                (err) => {
                    logAction(req.user.id, 'SHARE', file.id, `Shared with UserID: ${targetUser.id}`);
                    res.json({ success: true });
                }
            );
        });
    });
});

app.get('/admin/stats', authenticateToken, isAdmin, (req, res) => {
    const stats = {};
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        stats.users = row.count;
        db.get("SELECT COUNT(*) as count, SUM(size) as total_size FROM files", (err, row) => {
            stats.files = row.count;
            stats.total_size = row.total_size || 0;
            res.json(stats);
        });
    });
});

app.get('/admin/logs', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.timestamp DESC LIMIT 100", (err, rows) => {
        res.json(rows);
    });
});
app.get('/admin/users', authenticateToken, isAdmin, (req, res) => {
    db.all("SELECT id, username, role FROM users", (err, rows) => {
        res.json(rows);
    });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend securely running on port ${PORT}`);
});
