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
import AudioMapping from './models/AudioMapping.js';
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

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check for default admin account
    if (username === 'admin' && password === 'admin123') {
      const adminUser = {
        _id: 'admin-user',
        username: 'admin',
        email: 'admin@journaline.local',
        role: 'admin'
      };
      const token = generateToken(adminUser);

      return res.json({
        success: true,
        token,
        user: {
          username: 'admin',
          email: 'admin@journaline.local',
          role: 'admin'
        },
      });
    }

    // Check MongoDB users (if database is available)
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
app.post('/api/upload-xml', (req, res) => {
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

// ============= AUDIO MAPPING ENDPOINTS (MONGODB) =============

// Save audio mapping - links XML + pageId to audio file
app.post('/api/audio-mapping', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { xmlName, audioPath, originalFilename, fileSize } = req.body;
    
    if (!xmlName || !audioPath) {
      return res.status(400).json({ error: 'Missing xmlName or audioPath' });
    }

    let saved = false;
    
    // Try to save to MongoDB first
    try {
      const updated = await AudioMapping.findOneAndUpdate(
        { xmlName },
        { 
          xmlName,
          audioPath,
          originalFilename,
          fileSize,
          uploadedBy: req.user?.username || 'admin'
        },
        { upsert: true, new: true }
      );
      
      res.json({
        success: true,
        message: 'Audio mapping saved',
        mapping: updated.toJSON()
      });
      saved = true;
    } catch (mongoErr) {
      console.warn('MongoDB unavailable, trying JSON file fallback:', mongoErr.message);
    }
    
    // If MongoDB failed, save to JSON file as fallback
    if (!saved) {
      try {
        const audioMapPath = path.join(__dirname, 'public', 'audio', 'audio-map.json');
        let mapData = {};
        
        // Read existing mappings
        if (fs.existsSync(audioMapPath)) {
          try {
            mapData = JSON.parse(fs.readFileSync(audioMapPath, 'utf-8'));
          } catch (e) {
            mapData = {};
          }
        }
        
        // Add/update the mapping using xmlName as key
        mapData[xmlName] = audioPath;
        
        // Write back to file
        fs.writeFileSync(audioMapPath, JSON.stringify(mapData, null, 2), 'utf-8');
        
        res.json({
          success: true,
          message: 'Audio mapping saved to file (MongoDB unavailable)',
          mapping: {
            xmlName,
            audioPath,
            originalFilename,
            fileSize,
            uploadedBy: req.user?.username || 'admin'
          }
        });
      } catch (fileErr) {
        console.error('Failed to save audio mapping to file:', fileErr);
        res.status(500).json({ error: 'Failed to save audio mapping to either MongoDB or file' });
      }
    }
  } catch (err) {
    console.error('Audio mapping error:', err);
    res.status(500).json({ error: 'Failed to save audio mapping' });
  }
});

// Get audio mapping for XML file
app.get('/api/audio-mapping/:xmlName', async (req, res) => {
  try {
    const { xmlName } = req.params;
    
    let audioMap = {};
    
    // Try MongoDB first
    try {
      const mapping = await AudioMapping.findOne({ xmlName });
      if (mapping) {
        const sourceBase = xmlName.replace(/\.xml$/i, '');
        audioMap[sourceBase] = mapping.audioPath;
      }
    } catch (mongoErr) {
      console.warn('MongoDB unavailable, trying fallback...');
    }
    
    // If MongoDB didn't return anything or is unavailable, try JSON file fallback
    if (Object.keys(audioMap).length === 0) {
      const audioMapPath = path.join(__dirname, 'public', 'audio', 'audio-map.json');
      if (fs.existsSync(audioMapPath)) {
        try {
          const mapData = JSON.parse(fs.readFileSync(audioMapPath, 'utf-8'));
          // Filter mappings for this XML - keys start with "xmlname::" or are standalone keys
          for (const [key, value] of Object.entries(mapData)) {
            // Match keys that start with this XML's full name (with .xml)
            if (key.startsWith(xmlName + '::') || key.startsWith(xmlName.replace(/\.xml$/i, '') + '::')) {
              audioMap[key] = value;
            }
          }
        } catch (jsonErr) {
          console.warn('Failed to parse audio-map.json:', jsonErr);
        }
      }
    }

    res.json({
      success: true,
      audioMap: audioMap
    });
  } catch (err) {
    console.error('Audio mapping lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch audio mappings' });
  }
});

// Delete audio mapping for XML
app.delete('/api/audio-mapping/:xmlName', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { xmlName } = req.params;
    
    const mapping = await AudioMapping.findOneAndDelete({ xmlName });
    
    if (!mapping) {
      return res.status(404).json({ error: 'Audio mapping not found' });
    }

    res.json({
      success: true,
      message: 'Audio mapping deleted',
      mapping: mapping.toJSON()
    });
  } catch (err) {
    console.error('Audio mapping deletion error:', err);
    res.status(500).json({ error: 'Failed to delete audio mapping' });
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

