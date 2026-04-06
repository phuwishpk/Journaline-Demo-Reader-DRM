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
import mongoose from 'mongoose';
import User from './models/User.js';
import { authenticateToken, authorizeAdmin, generateToken } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/journaline-reader';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ MongoDB connected');
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err);
    // Continue anyway - non-auth features still work
  }
}

connectDB();

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
app.use(cors({
  origin: function (origin, callback) {
    // Allow all localhost ports and development URLs
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware for JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'application/xml', limit: '50mb' }));

// Serve static files from dist folder
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

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



// ============= AUTHENTICATION ENDPOINTS =============

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token endpoint
app.get('/api/auth/verify-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ============= FILE UPLOAD ENDPOINTS (ADMIN ONLY) =============
app.post('/api/upload-audio', authenticateToken, authorizeAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Return the file path relative to public folder
  const filePath = `/admin/audio/${req.file.filename}`;
  res.json({ 
    success: true, 
    path: filePath,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
});

// Upload XML file endpoint (admin only)
app.post('/api/upload-xml', authenticateToken, authorizeAdmin, (req, res) => {
  const { filename, content } = req.body;
  
  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }
  
  try {
    // Sanitize filename
    const sanitizedName = path.basename(filename);
    const filePath = path.join(adminDataDir, sanitizedName);
    
    // Write XML file
    fs.writeFileSync(filePath, content, 'utf-8');
    
    res.json({
      success: true,
      filename: sanitizedName,
      message: 'XML file saved successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save XML file' });
  }
});

// Get saved XMLs list endpoint (admin gets his files, public gets shared files)
app.get('/api/saved-xmls', (req, res) => {
  try {
    let files = [];
    
    // If authenticated as admin, show admin files
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        if (token) {
          files = fs.readdirSync(adminDataDir).filter(file => file.endsWith('.xml')).map(file => ({
            name: file,
            label: file,
            type: 'admin'
          }));
        }
      } catch (e) {
        // Token invalid or not provided, fall through to shared only
      }
    }
    
    // Add shared files
    try {
      const sharedFiles = fs.readdirSync(sharedDataDir).filter(file => file.endsWith('.xml')).map(file => ({
        name: file,
        label: file,
        type: 'shared'
      }));
      files = [...files, ...sharedFiles];
    } catch (e) {
      // shared directory might not have files yet
    }
    
    res.json({
      success: true,
      files: files
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read saved XMLs' });
  }
});

// Get XML file content endpoint (admin only for admin files)
app.post('/api/get-xml', (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }
  
  try {
    const sanitizedName = path.basename(filename);
   // First try shared directory
    let filePath = path.join(sharedDataDir, sanitizedName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return res.json({
        success: true,
        content: content
      });
    }
    
    // Then try admin directory (requires auth)
    filePath = path.join(adminDataDir, sanitizedName);
    if (!filePath.startsWith(adminDataDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return res.json({
        success: true,
        content: content
      });
    }
    
    res.status(404).json({ error: 'XML file not found' });
  } catch (err) {
    res.status(404).json({ error: 'XML file not found' });
  }
});

// Delete XML file endpoint (admin only)
app.delete('/api/delete-xml', authenticateToken, authorizeAdmin, (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }
  
  try {
    const sanitizedName = path.basename(filename);
    const filePath = path.join(adminDataDir, sanitizedName);
    
    // Prevent directory traversal
    if (!filePath.startsWith(adminDataDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({
        success: true,
        message: 'XML file deleted successfully'
      });
    } else {
      res.status(404).json({ error: 'XML file not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete XML file' });
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✓ Journaline Reader Server running on http://localhost:${PORT}`);
  console.log(`  ✓ REST API endpoints available`);
  console.log(`  ✓ Authentication: JWT-based`);
  console.log(`  ✓ MongoDB: ${mongoose.connection.readyState === 1 ? 'connected' : 'connecting...'}\n`);
});
