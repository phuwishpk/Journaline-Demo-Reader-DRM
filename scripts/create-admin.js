import 'dotenv/config';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import User from '../models/User.js';

async function createAdminUser() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/journaline-reader';
    console.log(`📦 Connecting to MongoDB: ${mongoUri}`);
    
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: adminUsername });
    if (existingAdmin) {
      console.log('ℹ Admin user already exists');
      return;
    }

    // Create admin user
    const admin = new User({
      username: adminUsername,
      email: 'admin@journaline-reader.local',
      passwordHash: adminPassword, // Will be hashed by pre-save hook
      role: 'admin',
    });

    await admin.save();
    console.log(`✓ Admin user created successfully!`);
    console.log(`  Username: ${adminUsername}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Role: ${admin.role}`);
  } catch (err) {
    console.error('✗ Error creating admin user:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

createAdminUser();
