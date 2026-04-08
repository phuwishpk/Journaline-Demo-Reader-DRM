import mongoose from 'mongoose';

const AudioMappingSchema = new mongoose.Schema(
  {
    xmlName: {
      type: String,
      required: true,  // e.g., 'root_pythagoras_th.xml'
      index: true,
      unique: true
    },
    audioPath: {
      type: String,
      required: true  // e.g., '/admin/audio/pythagoras-1234567890.wav'
    },
    uploadedBy: {
      type: String,
      default: 'admin'
    },
    originalFilename: String,
    fileSize: Number,
  },
  { timestamps: true }
);

export default mongoose.model('AudioMapping', AudioMappingSchema);
