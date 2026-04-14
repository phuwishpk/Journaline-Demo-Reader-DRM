import mongoose from 'mongoose';

const AudioFileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      enum: ['audio/mpeg', 'audio/wav', 'audio/mp3'],
      default: 'audio/wav',
    },
    fileSize: {
      type: Number,
      required: true,
    },
    // Store file content as Binary data using MongoDB's BinData type
    fileData: {
      type: Buffer,
      required: true,
    },
    uploadedBy: {
      type: String,
      default: 'admin',
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model('AudioFile', AudioFileSchema);
