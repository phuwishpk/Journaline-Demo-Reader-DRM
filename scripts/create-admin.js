import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcryptjs from 'bcryptjs';

async function createAdminUser() {
  const MYSQL_HOST = process.env.MYSQL_HOST;
  const MYSQL_PORT = Number.parseInt(process.env.MYSQL_PORT || '3306', 10);
  const MYSQL_DATABASE = process.env.MYSQL_DATABASE;
  const MYSQL_USER = process.env.MYSQL_USER;
  const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;

  if (!MYSQL_HOST || !MYSQL_DATABASE || !MYSQL_USER) {
    console.error('✗ Missing MySQL configuration. Set MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER (and MYSQL_PASSWORD if needed).');
    process.exit(1);
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@journaline-reader.local';

  let conn;
  try {
    conn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: Number.isFinite(MYSQL_PORT) ? MYSQL_PORT : 3306,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      charset: 'utf8mb4',
    });

    console.log(`✓ Connected to MySQL (${MYSQL_HOST}:${Number.isFinite(MYSQL_PORT) ? MYSQL_PORT : 3306}/${MYSQL_DATABASE})`);

    await conn.execute(`
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

    const [existingRows] = await conn.execute('SELECT id, role FROM users WHERE username = ? LIMIT 1', [adminUsername]);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing) {
      console.log('ℹ Admin user already exists');
      console.log(`  Username: ${adminUsername}`);
      console.log(`  Role: ${existing.role || 'unknown'}`);
      return;
    }

    const passwordHash = await bcryptjs.hash(String(adminPassword), 10);

    await conn.execute(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [adminUsername, adminEmail, passwordHash, 'admin']
    );

    console.log('✓ Admin user created successfully');
    console.log(`  Username: ${adminUsername}`);
    console.log(`  Email: ${adminEmail}`);
    console.log('  Role: admin');
  } catch (err) {
    console.error('✗ Error creating admin user:', err);
    process.exit(1);
  } finally {
    try {
      await conn?.end();
    } catch {
      // ignore
    }
  }
}

createAdminUser();
