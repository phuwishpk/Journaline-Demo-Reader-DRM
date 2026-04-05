import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import libxmljs from 'libxmljs2';
import os from 'os';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Body parser middleware for JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'application/xml', limit: '50mb' }));

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioDir);
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

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Upload audio file endpoint
app.post('/api/upload-audio', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Return the file path relative to public folder
  const filePath = `/audio/${req.file.filename}`;
  res.json({ 
    success: true, 
    path: filePath,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
});

// Upload XML file endpoint
app.post('/api/upload-xml', (req, res) => {
  const { filename, content } = req.body;
  
  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }
  
  try {
    // Sanitize filename
    const sanitizedName = path.basename(filename);
    const filePath = path.join(dataDir, sanitizedName);
    
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

// Get saved XMLs list endpoint
app.get('/api/saved-xmls', (req, res) => {
  try {
    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.xml'));
    res.json({
      success: true,
      files: files.map(file => ({
        name: file,
        label: file
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read saved XMLs' });
  }
});

// Get XML file content endpoint
app.post('/api/get-xml', (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }
  
  try {
    const sanitizedName = path.basename(filename);
    const filePath = path.join(dataDir, sanitizedName);
    
    // Prevent directory traversal
    if (!filePath.startsWith(dataDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({
      success: true,
      content: content
    });
  } catch (err) {
    res.status(404).json({ error: 'XML file not found' });
  }
});

// Delete XML file endpoint
app.delete('/api/delete-xml', (req, res) => {
  const { filename } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }
  
  try {
    const sanitizedName = path.basename(filename);
    const filePath = path.join(dataDir, sanitizedName);
    
    // Prevent directory traversal
    if (!filePath.startsWith(dataDir)) {
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
    
    // Load XSD schema
    const xsdPath = path.join(dataDir, 'Journaline.xsd');
    if (!fs.existsSync(xsdPath)) {
      return res.status(400).json({ 
        valid: false,
        error: 'Journaline.xsd not found in /data directory'
      });
    }
    
    try {
      // Parse XML and XSD
      const xmlDoc = libxmljs.parseXml(xmlContent);
      const xsdContent = fs.readFileSync(xsdPath, 'utf-8');
      const xsdDoc = libxmljs.parseXml(xsdContent);
      
      // Validate XML against XSD
      const isValid = xmlDoc.validate(xsdDoc);
      
      if (isValid) {
        res.json({
          valid: true,
          message: 'XML is valid according to Journaline.xsd',
          errors: []
        });
      } else {
        const errors = xmlDoc.validationErrors.map(err => ({
          message: err.message,
          level: err.level,
          file: err.file,
          line: err.line,
          column: err.column
        }));
        
        res.json({
          valid: false,
          message: 'XML validation failed',
          errors: errors
        });
      }
    } catch (validationErr) {
      res.json({
        valid: false,
        message: 'XML validation failed',
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
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`\n✓ Audio server running on http://localhost:${PORT}`);
  console.log(`  Upload endpoint: POST /api/upload-audio\n`);
});
