import { useState } from 'react';
import { useAuth } from '../AuthContext';

export default function LoginPage({ onLoginSuccess, onBack }: { onLoginSuccess: () => void; onBack: () => void }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const ok = await login(username, password);
      if (ok) {
        onLoginSuccess();
      } else {
        setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-card">
          <div className="brand-logo" aria-hidden="true">JR</div>
          <div>
            <h1>Admin Login</h1>
            <p>เข้าสู่ระบบเพื่ออัปโหลด XML รูปภาพ และไฟล์เสียง</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          </label>
          {error ? <div className="error-text">{error}</div> : null}
          <div className="login-actions">
            <button type="submit" className="secondary-button" disabled={loading}>
              {loading ? 'Loading...' : 'Login'}
            </button>
            <button type="button" className="ghost-button" onClick={onBack} disabled={loading}>Back to Public</button>
          </div>
        </form>

        <div className="helper-text">ค่าเริ่มต้นสำหรับเดโม: <code>admin / admin123</code></div>
      </div>
    </div>
  );
}
