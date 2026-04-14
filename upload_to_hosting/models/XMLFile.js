import mongoose from 'mongoose';

const XMLFileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: String,
      default: 'admin',
    },
    fileSize: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

export default mongoose.model('XMLFile', XMLFileSchema);
