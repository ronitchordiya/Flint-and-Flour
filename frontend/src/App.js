import React, { createContext, useContext, useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      fetchUserProfile(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, refresh_token } = response.data;
      
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      
      await fetchUserProfile(access_token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const register = async (email, password, region) => {
    try {
      const response = await axios.post(`${API}/auth/register`, { email, password, region });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Registration failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const updateProfile = async (profileData) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.put(`${API}/user/profile`, profileData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Update failed' };
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    updateProfile,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Components
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Loading...</div>;
  
  return user ? children : <Navigate to="/login" />;
};

const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          Flint & Flours 🥖
        </Link>
        <nav className="nav">
          {user ? (
            <div className="user-menu">
              <span className="user-info">
                {user.email} ({user.region})
                {user.is_email_verified ? ' ✅' : ' ⚠️'}
              </span>
              <Link to="/profile" className="nav-link">Profile</Link>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>
          ) : (
            <div className="auth-links">
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="nav-link">Register</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="home">
      <div className="hero">
        <h1>Welcome to Flint & Flours</h1>
        <p>Artisan Baked Goods from India 🇮🇳 and Canada 🇨🇦</p>
        {user ? (
          <div className="welcome-user">
            <h2>Hello, {user.email}!</h2>
            <p>Your region: <strong>{user.region}</strong></p>
            {!user.is_email_verified && (
              <div className="verification-notice">
                ⚠️ Please check your email to verify your account
              </div>
            )}
          </div>
        ) : (
          <div className="cta">
            <Link to="/register" className="cta-button">Get Started</Link>
          </div>
        )}
      </div>
    </div>
  );
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/profile');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(email, password);
    if (result.success) {
      navigate('/profile');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Login to Your Account</h2>
        {error && <div className="error">{error}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Your password"
          />
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <div className="auth-links">
          <Link to="/register">Don't have an account? Register</Link>
          <Link to="/reset-password">Forgot password?</Link>
        </div>
      </form>
    </div>
  );
};

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('India');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/profile');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const result = await register(email, password, region);
    if (result.success) {
      setSuccess('Registration successful! Please check the console for email verification link, then login.');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Create Your Account</h2>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength="6"
            placeholder="At least 6 characters"
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">Region</label>
          <select
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            required
          >
            <option value="India">🇮🇳 India</option>
            <option value="Canada">🇨🇦 Canada</option>
          </select>
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Creating Account...' : 'Register'}
        </button>

        <div className="auth-links">
          <Link to="/login">Already have an account? Login</Link>
        </div>
      </form>
    </div>
  );
};

const Profile = () => {
  const { user, updateProfile, logout } = useAuth();
  const [region, setRegion] = useState(user?.region || 'India');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await updateProfile({ region });
    if (result.success) {
      setMessage('Profile updated successfully!');
    } else {
      setMessage(`Error: ${result.error}`);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="profile-page">
      <div className="profile-container">
        <h2>User Profile</h2>
        
        <div className="profile-info">
          <div className="info-card">
            <h3>Account Information</h3>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Current Region:</strong> {user.region}</p>
            <p><strong>Email Verified:</strong> {user.is_email_verified ? '✅ Yes' : '⚠️ No'}</p>
            <p><strong>Member Since:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
          </div>

          {!user.is_email_verified && (
            <div className="verification-notice">
              <h4>⚠️ Email Verification Required</h4>
              <p>Please check the console logs for your email verification link.</p>
            </div>
          )}
        </div>

        <form className="profile-form" onSubmit={handleUpdateProfile}>
          <h3>Update Profile</h3>
          {message && <div className={message.includes('Error') ? 'error' : 'success'}>{message}</div>}
          
          <div className="form-group">
            <label htmlFor="region">Region Preference</label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              required
            >
              <option value="India">🇮🇳 India</option>
              <option value="Canada">🇨🇦 Canada</option>
            </select>
          </div>

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Updating...' : 'Update Profile'}
          </button>
        </form>

        <div className="profile-actions">
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

const ResetPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await axios.post(`${API}/auth/reset-password`, { email });
      setMessage('If the email exists, a reset link has been sent. Check the console logs.');
    } catch (error) {
      setMessage('Error sending reset link. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Reset Password</h2>
        {message && <div className="info">{message}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
          />
        </div>

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>

        <div className="auth-links">
          <Link to="/login">Back to Login</Link>
        </div>
      </form>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Header />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
            </Routes>
          </main>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
