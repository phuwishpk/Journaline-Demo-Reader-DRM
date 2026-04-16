import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import os from 'os';
import crypto from 'crypto';
import 'dotenv/config';
import bcryptjs from 'bcryptjs';
import { authenticateToken, authorizeAdmin, generateToken } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.HTTP_PLATFORM_PORT || process.env.PORT || process.env.npm_package_config_port || 5005;

// MySQL connection (primary database)
const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number.parseInt(process.env.MYSQL_PORT || '3306', 10);
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;

const mysqlState = {
  pool: null,
  connected: false,
};

function isMySqlConfigured() {
  return Boolean(MYSQL_HOST && MYSQL_DATABASE && MYSQL_USER);
}

async function ensureMySqlSchema() {
  if (!mysqlState.pool) return;

  await mysqlState.pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'public') NOT NULL DEFAULT 'public',
      last_login DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_users_username (username),
      UNIQUE KEY uniq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await mysqlState.pool.execute(`
    CREATE TABLE IF NOT EXISTS xml_files (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      content LONGTEXT NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL DEFAULT 'admin',
      file_size INT UNSIGNED NOT NULL,
      description VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_xml_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await mysqlState.pool.execute(`
    CREATE TABLE IF NOT EXISTS audio_files (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(64) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      file_data LONGBLOB NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL DEFAULT 'admin',
      description VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_audio_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await mysqlState.pool.execute(`
    CREATE TABLE IF NOT EXISTS audio_mappings (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      xml_name VARCHAR(255) NOT NULL,
      audio_path VARCHAR(1024) NOT NULL,
      uploaded_by VARCHAR(64) NOT NULL DEFAULT 'admin',
      original_filename VARCHAR(255) NULL,
      file_size INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_audio_mapping_xml (xml_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function connectMySql() {
  if (!isMySqlConfigured()) {
    console.warn('⚠️  MySQL is not configured (missing MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER). Database features will be unavailable.');
    return;
  }

  let mysqlDriver;
  try {
    const mod = await import('mysql2/promise');
    mysqlDriver = mod.default ?? mod;
  } catch (err) {
    mysqlState.connected = false;
    console.error('✗ MySQL driver not installed (missing package: mysql2). Run npm install on the server, then restart the app.');
    console.error(err);
    return;
  }

  try {
    mysqlState.pool = mysqlDriver.createPool({
      host: MYSQL_HOST,
      port: Number.isFinite(MYSQL_PORT) ? MYSQL_PORT : 3306,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });

    await mysqlState.pool.query('SELECT 1');
    mysqlState.connected = true;
    console.log('✓ MySQL connected');

    await ensureMySqlSchema();
  } catch (err) {
    mysqlState.connected = false;
    console.error('✗ MySQL connection failed:', err);
  }
}

function requireMySql(res) {
  if (!mysqlState.pool || !mysqlState.connected) {
    res.status(503).json({ error: 'Database unavailable' });
    return null;
  }
  return mysqlState.pool;
}

void connectMySql();

// Ensure admin directories exist
const adminDataDir = path.join(__dirname, 'public', 'admin', 'data');
const adminAudioDir = path.join(__dirname, 'public', 'admin', 'audio');
const adminImageDir = path.join(__dirname, 'public', 'admin', 'images');

// Ensure shared directories exist
const sharedDataDir = path.join(__dirname, 'public', 'shared', 'data');
const sharedImageDir = path.join(__dirname, 'public', 'shared', 'images');
const sharedAudioDir = path.join(__dirname, 'public', 'shared', 'audio');

[adminDataDir, adminAudioDir, adminImageDir, sharedDataDir, sharedImageDir, sharedAudioDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// CORS middleware - must be before routes
const allowedOriginPatterns = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/([a-z0-9-]+\.)?am-drm-radio\.net(?::\d+)?$/i,
  /^https?:\/\/203\.150\.225\.101(?::\d+)?$/i,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOriginPatterns.some((re) => re.test(origin))) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser middleware for JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'application/xml', limit: '50mb' }));

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for root path - serve compiled index.html from dist
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Configure multer for audio uploads (admin only)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, adminAudioDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow audio files
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/mp3'];
    const allowedExts = ['.mp3', '.wav'];
    
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 and WAV files are allowed'));
    }
  }
});

// Configure multer for image uploads (admin only)
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, adminImageDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}${ext}`);
  }
});

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});



// ============= AUTHENTICATION ENDPOINTS =============

const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const allowDefaultAdmin = !isProduction || (process.env.ALLOW_DEFAULT_ADMIN || '').toLowerCase() === 'true';
const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'admin123';

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const trimmedUsername = String(username).trim();

    // Default admin account (development only unless explicitly enabled)
    if (
      allowDefaultAdmin &&
      trimmedUsername === defaultAdminUsername &&
      String(password) === defaultAdminPassword
    ) {
      const adminUser = {
        _id: 'admin-user',
        username: defaultAdminUsername,
        email: 'admin@journaline.local',
        role: 'admin',
      };
      const token = generateToken(adminUser);

      return res.json({
        success: true,
        token,
        user: {
          username: adminUser.username,
          email: adminUser.email,
          role: adminUser.role,
        },
      });
    }

    const pool = requireMySql(res);
    if (!pool) return;

    const [rows] = await pool.execute(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = ? LIMIT 1',
      [trimmedUsername]
    );

    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcryptjs.compare(String(password), user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = generateToken({
      _id: String(user.id),
      username: user.username,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify-token', authenticateToken, async (req, res) => {
  try {
    if (allowDefaultAdmin && req.user?.id === 'admin-user') {
      return res.json({
        success: true,
        user: {
          username: defaultAdminUsername,
          email: 'admin@journaline.local',
          role: 'admin',
        },
      });
    }

    const pool = requireMySql(res);
    if (!pool) return;

    const userId = Number.parseInt(String(req.user?.id || ''), 10);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: 'User not found' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, email, role FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ============= FILE UPLOAD ENDPOINTS (ADMIN ONLY) =============
app.post('/api/upload-audio', authenticateToken, authorizeAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  try {
    // Read file data from disk
    const fileData = fs.readFileSync(req.file.path);

    const [result] = await pool.execute(
      'INSERT INTO audio_files (filename, original_filename, mime_type, file_size, file_data, uploaded_by, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        fileData,
        req.user?.username || 'admin',
        '',
      ]
    );

    // Delete temp file from disk after saving to DB
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      fileId: String(result.insertId),
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  } catch (err) {
    console.error('Audio upload error:', err);
    // Clean up temp file if exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to save audio file to database' });
  }
});

// Upload image file endpoint (admin only)
app.post('/api/upload-image', authenticateToken, authorizeAdmin, uploadImage.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Return the file path relative to public folder
  const filePath = `/admin/images/${req.file.filename}`;
  res.json({ 
    success: true, 
    path: filePath,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
});

// Upload XML file endpoint (admin only)
app.post('/api/upload-xml', authenticateToken, authorizeAdmin, async (req, res) => {
  const { filename, content } = req.body ?? {};

  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  try {
    // Sanitize filename
    const sanitizedName = path.basename(String(filename));
    const xmlContent = String(content);
    const fileSize = Buffer.byteLength(xmlContent, 'utf-8');

    await pool.execute(
      `INSERT INTO xml_files (filename, content, uploaded_by, file_size, description)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         content = VALUES(content),
         uploaded_by = VALUES(uploaded_by),
         file_size = VALUES(file_size),
         updated_at = CURRENT_TIMESTAMP`,
      [sanitizedName, xmlContent, req.user?.username || 'admin', fileSize, '']
    );

    const [rows] = await pool.execute(
      'SELECT id, filename FROM xml_files WHERE filename = ? LIMIT 1',
      [sanitizedName]
    );

    const saved = Array.isArray(rows) ? rows[0] : null;

    res.json({
      success: true,
      fileId: saved ? String(saved.id) : null,
      filename: saved ? saved.filename : sanitizedName,
      message: 'XML file saved successfully',
    });
  } catch (err) {
    console.error('XML upload error:', err);
    res.status(500).json({ error: 'Failed to save XML file to database' });
  }
});

// Get saved XMLs list endpoint
app.get('/api/saved-xmls', async (req, res) => {
  const pool = requireMySql(res);
  if (!pool) return;

  try {
    const [rows] = await pool.execute(
      'SELECT id, filename, uploaded_by, created_at, file_size FROM xml_files ORDER BY created_at DESC'
    );

    const files = (Array.isArray(rows) ? rows : []).map((file) => ({
      _id: String(file.id),
      name: file.filename,
      label: file.filename,
      type: 'database',
      uploadedBy: file.uploaded_by,
      createdAt: file.created_at,
      fileSize: file.file_size,
    }));

    res.json({
      success: true,
      files,
    });
  } catch (err) {
    console.error('Error fetching XML files:', err);
    res.status(500).json({ error: 'Failed to read saved XMLs' });
  }
});

// Get XML file content endpoint
app.post('/api/get-xml', async (req, res) => {
  const { filename, fileId } = req.body ?? {};

  if (!filename && !fileId) {
    return res.status(400).json({ error: 'Missing filename or fileId' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  try {
    let row = null;

    if (fileId) {
      const id = Number.parseInt(String(fileId), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid fileId' });
      }

      const [rows] = await pool.execute(
        'SELECT id, filename, content FROM xml_files WHERE id = ? LIMIT 1',
        [id]
      );
      row = Array.isArray(rows) ? rows[0] : null;
    } else {
      const sanitizedName = path.basename(String(filename));
      const [rows] = await pool.execute(
        'SELECT id, filename, content FROM xml_files WHERE filename = ? LIMIT 1',
        [sanitizedName]
      );
      row = Array.isArray(rows) ? rows[0] : null;
    }

    if (!row) {
      return res.status(404).json({ error: 'XML file not found' });
    }

    res.json({
      success: true,
      content: row.content,
      filename: row.filename,
      fileId: String(row.id),
    });
  } catch (err) {
    console.error('Error fetching XML file:', err);
    res.status(500).json({ error: 'Failed to retrieve XML file' });
  }
});

// Get audio file endpoint (supports both POST and GET)
app.post('/api/get-audio', async (req, res) => {
  const { fileId } = req.body ?? {};

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  const id = Number.parseInt(String(fileId), 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid fileId' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT original_filename, mime_type, file_data FROM audio_files WHERE id = ? LIMIT 1',
      [id]
    );

    const audioFile = Array.isArray(rows) ? rows[0] : null;
    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const safeName = path
      .basename(String(audioFile.original_filename || 'audio.wav'))
      .replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', audioFile.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Content-Length', audioFile.file_data.length);

    res.send(audioFile.file_data);
  } catch (err) {
    console.error('Error fetching audio file:', err);
    res.status(500).json({ error: 'Failed to retrieve audio file' });
  }
});

// Get audio file endpoint via query parameter (for HTML5 audio tag which uses GET)
app.get('/api/get-audio', async (req, res) => {
  const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : null;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  const id = Number.parseInt(String(fileId), 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid fileId' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT original_filename, mime_type, file_data FROM audio_files WHERE id = ? LIMIT 1',
      [id]
    );

    const audioFile = Array.isArray(rows) ? rows[0] : null;
    if (!audioFile) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const safeName = path
      .basename(String(audioFile.original_filename || 'audio.wav'))
      .replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', audioFile.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('Content-Length', audioFile.file_data.length);

    res.send(audioFile.file_data);
  } catch (err) {
    console.error('Error fetching audio file:', err);
    res.status(500).json({ error: 'Failed to retrieve audio file' });
  }
});

// Delete XML file endpoint (admin only)
app.delete('/api/delete-xml', authenticateToken, authorizeAdmin, async (req, res) => {
  const { filename, fileId } = req.body ?? {};

  if (!filename && !fileId) {
    return res.status(400).json({ error: 'Missing filename or fileId' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  try {
    let affectedRows = 0;

    if (fileId) {
      const id = Number.parseInt(String(fileId), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid fileId' });
      }

      const [result] = await pool.execute('DELETE FROM xml_files WHERE id = ? LIMIT 1', [id]);
      affectedRows = result.affectedRows || 0;
    } else {
      const sanitizedName = path.basename(String(filename));
      const [result] = await pool.execute('DELETE FROM xml_files WHERE filename = ? LIMIT 1', [sanitizedName]);
      affectedRows = result.affectedRows || 0;
    }

    if (!affectedRows) {
      return res.status(404).json({ error: 'XML file not found' });
    }

    res.json({
      success: true,
      message: 'XML file deleted successfully',
    });
  } catch (err) {
    console.error('Error deleting XML file:', err);
    res.status(500).json({ error: 'Failed to delete XML file' });
  }
});

// ============= MEDIA ENDPOINTS (for MediaMapper) =============

// Get list of audio and image files
app.get('/api/media/list', (req, res) => {
  try {
    const audioDir = path.join(__dirname, 'public', 'audio');
    const imageDir = path.join(__dirname, 'public', 'images');
    
    console.log('📂 API /api/media/list called');
    console.log('   audioDir:', audioDir, 'exists:', fs.existsSync(audioDir));
    console.log('   imageDir:', imageDir, 'exists:', fs.existsSync(imageDir));
    
    let audioFiles = [];
    let imageFiles = [];

    // Read audio files
    if (fs.existsSync(audioDir)) {
      const files = fs.readdirSync(audioDir);
      audioFiles = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.mp3', '.wav', '.m4a', '.ogg'].includes(ext);
        })
        .map(f => ({
          name: f,
          stem: path.basename(f, path.extname(f)),
          type: 'audio',
          url: `/audio/${f}`
        }));
    }

    // Read image files recursively
    function scanImageDir(dir, prefix = '') {
      const items = [];
      const files = fs.readdirSync(dir);
      
      for (const f of files) {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recurse into subdirectories
          items.push(...scanImageDir(fullPath, prefix ? `${prefix}/${f}` : f));
        } else {
          const ext = path.extname(f).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            items.push({
              name: f,
              stem: path.basename(f, path.extname(f)),
              type: 'image',
              folder: prefix,
              url: `/images/${prefix ? prefix + '/' : ''}${f}`
            });
          }
        }
      }
      
      return items;
    }

    if (fs.existsSync(imageDir)) {
      imageFiles = scanImageDir(imageDir);
    }

    res.json({
      success: true,
      audio: audioFiles,
      images: imageFiles
    });
  } catch (err) {
    console.error('Media list error:', err);
    res.status(500).json({ error: 'Failed to list media files' });
  }
});

// Get audio/image files that match XML filename
app.get('/api/media/by-xmlname', (req, res) => {
  try {
    const xmlName = req.query.name;
    if (!xmlName) {
      return res.status(400).json({ error: 'Missing name parameter' });
    }

    const audioDir = path.join(__dirname, 'public', 'audio');
    const imageDir = path.join(__dirname, 'public', 'images');
    
    console.log('🔍 API /api/media/by-xmlname called with:', xmlName);
    
    let audioFiles = [];
    let imageFiles = [];

    // Read audio files that match xmlName
    if (fs.existsSync(audioDir)) {
      const files = fs.readdirSync(audioDir);
      audioFiles = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          const matchesExt = ['.mp3', '.wav', '.m4a', '.ogg'].includes(ext);
          const stem = path.basename(f, ext).toLowerCase();
          const xmlNameLower = xmlName.toLowerCase();
          // Match if stem equals xmlName or starts with xmlName_
          const matches = stem === xmlNameLower || stem.startsWith(xmlNameLower + '_');
          return matchesExt && matches;
        })
        .map(f => ({
          name: f,
          stem: path.basename(f, path.extname(f)),
          type: 'audio',
          url: `/audio/${f}`
        }));
    }

    // Read image files that match xmlName
    function scanImageDirByName(dir, xmlNameLower, prefix = '') {
      const items = [];
      const files = fs.readdirSync(dir);
      
      for (const f of files) {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          items.push(...scanImageDirByName(fullPath, xmlNameLower, prefix ? `${prefix}/${f}` : f));
        } else {
          const ext = path.extname(f).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            const stem = path.basename(f, ext).toLowerCase();
            // Match if stem equals xmlName or starts with xmlName_
            if (stem === xmlNameLower || stem.startsWith(xmlNameLower + '_')) {
              items.push({
                name: f,
                stem: path.basename(f, ext),
                type: 'image',
                folder: prefix,
                url: `/images/${prefix ? prefix + '/' : ''}${f}`
              });
            }
          }
        }
      }
      return items;
    }

    if (fs.existsSync(imageDir)) {
      imageFiles = scanImageDirByName(imageDir, xmlName.toLowerCase());
    }

    console.log(`  Found ${audioFiles.length} audio files, ${imageFiles.length} image files`);

    res.json({
      success: true,
      audio: audioFiles,
      images: imageFiles
    });
  } catch (err) {
    console.error('Media by name error:', err);
    res.status(500).json({ error: 'Failed to fetch media files by XML name' });
  }
});

// Validate XML against Journaline.xsd
app.post('/api/validate-xml', (req, res) => {
  try {
    const { xmlContent } = req.body;
    
    if (!xmlContent) {
      return res.status(400).json({ error: 'Missing XML content' });
    }
    
    // Load XSD schema from shared directory
    const xsdPath = path.join(sharedDataDir, 'Journaline.xsd');
    if (!fs.existsSync(xsdPath)) {
      return res.status(400).json({ 
        valid: false,
        error: 'Journaline.xsd not found'
      });
    }
    
    try {
      // Parse XML to validate it's well-formed
      const parser = new XMLParser();
      const xmlDoc = parser.parse(xmlContent);
      
      // Validate XML is well-formed (if parsing succeeded, it's valid)
      res.json({
        valid: true,
        message: 'XML is well-formed',
        errors: []
      });
    } catch (validationErr) {
      res.json({
        valid: false,
        message: 'XML parsing failed',
        error: validationErr instanceof Error ? validationErr.message : 'Validation error'
      });
    }
  } catch (err) {
    res.status(500).json({
      valid: false,
      error: `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}`
    });
  }
});

// ============= AUDIO MAPPING ENDPOINTS (MYSQL + FILE FALLBACK) =============

// Save audio mapping - links XML to audio file (path or uploaded fileId)
app.post('/api/audio-mapping', authenticateToken, authorizeAdmin, async (req, res) => {
  const { xmlName, audioPath, originalFilename, fileSize } = req.body ?? {};

  if (!xmlName || !audioPath) {
    return res.status(400).json({ error: 'Missing xmlName or audioPath' });
  }

  const pool = requireMySql(res);
  if (!pool) return;

  const xmlNameKey = path.basename(String(xmlName)).toLowerCase();
  const uploadedBy = req.user?.username || 'admin';
  const parsedFileSize = fileSize == null ? null : Number(fileSize);
  const safeFileSize = Number.isFinite(parsedFileSize) ? parsedFileSize : null;

  try {
    await pool.execute(
      `INSERT INTO audio_mappings (xml_name, audio_path, original_filename, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         audio_path = VALUES(audio_path),
         original_filename = VALUES(original_filename),
         file_size = VALUES(file_size),
         uploaded_by = VALUES(uploaded_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        xmlNameKey,
        String(audioPath),
        originalFilename ? String(originalFilename) : null,
        safeFileSize,
        uploadedBy,
      ]
    );

    res.json({
      success: true,
      message: 'Audio mapping saved',
      mapping: {
        xmlName: xmlNameKey,
        audioPath: String(audioPath),
        originalFilename: originalFilename ? String(originalFilename) : null,
        fileSize: safeFileSize,
        uploadedBy,
      },
    });
  } catch (err) {
    console.error('Audio mapping error:', err);
    res.status(500).json({ error: 'Failed to save audio mapping' });
  }
});

// Get audio mapping for XML file
app.get('/api/audio-mapping/:xmlName', async (req, res) => {
  try {
    const requestedXmlName = path.basename(String(req.params.xmlName || '')).toLowerCase();
    const requestedBase = requestedXmlName.replace(/\.xml$/i, '');

    const audioMap = {};

    // 1) MySQL (xml-level mapping)
    if (mysqlState.connected && mysqlState.pool) {
      try {
        const [rows] = await mysqlState.pool.execute(
          'SELECT audio_path, original_filename FROM audio_mappings WHERE xml_name = ? LIMIT 1',
          [requestedXmlName]
        );

        const mapping = Array.isArray(rows) ? rows[0] : null;
        if (mapping && mapping.audio_path) {
          const audioPath = String(mapping.audio_path);

          if (audioPath.startsWith('/')) {
            audioMap[requestedBase] = audioPath;
          } else if (/^\d+$/.test(audioPath)) {
            const name = mapping.original_filename ? String(mapping.original_filename) : 'audio.wav';
            audioMap[requestedBase] = { fileId: audioPath, filename: name, originalName: name };
          } else {
            audioMap[requestedBase] = audioPath;
          }
        }
      } catch (dbErr) {
        console.warn('MySQL unavailable, falling back to audio-map.json');
      }
    }

    // 2) JSON file fallback (per-page + xml-level mappings)
    const audioMapPath = path.join(__dirname, 'public', 'audio', 'audio-map.json');
    if (fs.existsSync(audioMapPath)) {
      try {
        const mapData = JSON.parse(fs.readFileSync(audioMapPath, 'utf-8'));

        for (const [key, rawValue] of Object.entries(mapData)) {
          if (typeof key !== 'string') continue;

          const keyLower = key.toLowerCase();
          const matches =
            keyLower === requestedXmlName ||
            keyLower === requestedBase ||
            keyLower.startsWith(requestedXmlName + '::') ||
            keyLower.startsWith(requestedBase + '::');

          if (!matches) continue;

          // Normalize xml prefix to lower-case for consistent client matching
          let normalizedKey = key;
          const sepIndex = key.indexOf('::');
          if (sepIndex !== -1) {
            normalizedKey = `${key.slice(0, sepIndex).toLowerCase()}${key.slice(sepIndex)}`;
          } else if (/\.xml$/i.test(key)) {
            normalizedKey = keyLower;
          } else if (keyLower === requestedBase) {
            normalizedKey = requestedBase;
          }

          // Normalize numeric fileId values to object form for frontend
          let value = rawValue;
          if (typeof rawValue === 'string' && /^\d+$/.test(rawValue)) {
            value = { fileId: rawValue, filename: 'audio.wav', originalName: 'audio.wav' };
          }

          audioMap[normalizedKey] = value;
        }
      } catch (jsonErr) {
        console.warn('Failed to parse audio-map.json:', jsonErr);
      }
    }

    res.json({
      success: true,
      audioMap,
    });
  } catch (err) {
    console.error('Audio mapping lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch audio mappings' });
  }
});

// Delete audio mapping for XML
app.delete('/api/audio-mapping/:xmlName', authenticateToken, authorizeAdmin, async (req, res) => {
  const pool = requireMySql(res);
  if (!pool) return;

  const requestedXmlName = path.basename(String(req.params.xmlName || '')).toLowerCase();

  try {
    const [result] = await pool.execute('DELETE FROM audio_mappings WHERE xml_name = ? LIMIT 1', [requestedXmlName]);
    const affectedRows = result.affectedRows || 0;

    if (!affectedRows) {
      return res.status(404).json({ error: 'Audio mapping not found' });
    }

    res.json({
      success: true,
      message: 'Audio mapping deleted',
    });
  } catch (err) {
    console.error('Audio mapping deletion error:', err);
    res.status(500).json({ error: 'Failed to delete audio mapping' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mysql: mysqlState.connected ? 'connected' : 'disconnected' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Journaline Reader Server running on port ${PORT}`);
  console.log(`  ✓ REST API endpoints available`);
  console.log(`  ✓ Authentication: JWT-based`);
  console.log(`  ✓ MySQL: ${mysqlState.connected ? 'connected' : 'disconnected'}\n`);
});

server.on('error', (err) => {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${PORT} is already in use (EADDRINUSE).`);
    console.error('  - Change PORT in .env (local) or set PORT/HTTP_PLATFORM_PORT (hosting), then restart.');
    process.exit(1);
  }
  throw err;
});

// Export for potential use in other modules
export default app;
export { server };

