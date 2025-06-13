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

// Shopping Context
const ShoppingContext = createContext();

const ShoppingProvider = ({ children }) => {
  const [cart, setCart] = useState([]);
  const [region, setRegion] = useState(localStorage.getItem('selectedRegion') || 'India');

  useEffect(() => {
    localStorage.setItem('selectedRegion', region);
  }, [region]);

  const addToCart = (product, quantity = 1, subscriptionType = 'one-time') => {
    setCart(prev => {
      const existingItem = prev.find(item => 
        item.product_id === product.id && item.subscription_type === subscriptionType
      );
      
      if (existingItem) {
        return prev.map(item =>
          item.product_id === product.id && item.subscription_type === subscriptionType
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        return [...prev, { 
          product_id: product.id, 
          quantity, 
          subscription_type: subscriptionType,
          product: product
        }];
      }
    });
  };

  const removeFromCart = (productId, subscriptionType) => {
    setCart(prev => prev.filter(item => 
      !(item.product_id === productId && item.subscription_type === subscriptionType)
    ));
  };

  const updateCartQuantity = (productId, subscriptionType, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId, subscriptionType);
    } else {
      setCart(prev => prev.map(item =>
        item.product_id === productId && item.subscription_type === subscriptionType
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const clearCart = () => {
    setCart([]);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const value = {
    cart,
    region,
    setRegion,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    getCartTotal
  };

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>;
};

const useShopping = () => {
  const context = useContext(ShoppingContext);
  if (!context) {
    throw new Error('useShopping must be used within ShoppingProvider');
  }
  return context;
};

// Components
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Loading...</div>;
  
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Loading...</div>;
  
  if (!user) return <Navigate to="/login" />;
  if (!user.is_admin) return <Navigate to="/" />;
  
  return children;
};

const Header = () => {
  const { user, logout } = useAuth();
  const { region, setRegion, getCartTotal } = useShopping();
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
        
        <div className="header-center">
          <div className="region-selector">
            <select 
              value={region} 
              onChange={(e) => setRegion(e.target.value)}
              className="region-select"
            >
              <option value="India">🇮🇳 India</option>
              <option value="Canada">🇨🇦 Canada</option>
            </select>
          </div>
        </div>

        <nav className="nav">
          <Link to="/products" className="nav-link">Products</Link>
          <Link to="/cart" className="nav-link cart-link">
            Cart ({getCartTotal()})
          </Link>
          
          {user ? (
            <div className="user-menu">
              <span className="user-info">
                {user.email}
                {user.is_email_verified ? ' ✅' : ' ⚠️'}
              </span>
              <Link to="/profile" className="nav-link">Profile</Link>
              {user.is_admin && (
                <Link to="/admin" className="nav-link admin-link">Admin</Link>
              )}
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
  const { region } = useShopping();
  const [deliveryInfo, setDeliveryInfo] = useState(null);

  useEffect(() => {
    fetchDeliveryInfo();
  }, [region]);

  const fetchDeliveryInfo = async () => {
    try {
      const response = await axios.get(`${API}/delivery?region=${region}`);
      setDeliveryInfo(response.data);
    } catch (error) {
      console.error('Error fetching delivery info:', error);
    }
  };

  return (
    <div className="home">
      <div className="hero">
        <h1>Welcome to Flint & Flours</h1>
        <p>Artisan Baked Goods from India 🇮🇳 and Canada 🇨🇦</p>
        
        {deliveryInfo && (
          <div className="delivery-banner">
            <p className="delivery-message">{deliveryInfo.message}</p>
          </div>
        )}
        
        {user ? (
          <div className="welcome-user">
            <h2>Hello, {user.email}!</h2>
            <p>Your region: <strong>{user.region}</strong></p>
            {!user.is_email_verified && (
              <div className="verification-notice">
                ⚠️ Please check your email to verify your account
              </div>
            )}
            <div className="cta-buttons">
              <Link to="/products" className="cta-button">Browse Products</Link>
            </div>
          </div>
        ) : (
          <div className="cta">
            <div className="cta-buttons">
              <Link to="/products" className="cta-button">Browse Products</Link>
              <Link to="/register" className="cta-button-secondary">Get Started</Link>
            </div>
          </div>
        )}
      </div>
      
      <div className="features">
        <div className="feature-grid">
          <div className="feature-card">
            <h3>🍪 Artisan Cookies</h3>
            <p>Hand-crafted cookies made with premium ingredients</p>
          </div>
          <div className="feature-card">
            <h3>🎂 Premium Cakes</h3>
            <p>Custom cakes for every celebration and occasion</p>
          </div>
          <div className="feature-card">
            <h3>🍞 Fresh Breads</h3>
            <p>Daily baked artisan breads with traditional methods</p>
          </div>
          <div className="feature-card">
            <h3>🔄 Subscriptions</h3>
            <p>Weekly and monthly delivery options available</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const { region, addToCart } = useShopping();

  useEffect(() => {
    fetchProducts();
  }, [region, category]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const categoryParam = category !== 'all' ? `&category=${category}` : '';
      const response = await axios.get(`${API}/products?region=${region}${categoryParam}`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (product, subscriptionType = 'one-time') => {
    addToCart(product, 1, subscriptionType);
  };

  if (loading) return <div className="loading">Loading products...</div>;

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Our Products</h1>
        <div className="category-filters">
          <button 
            className={category === 'all' ? 'active' : ''}
            onClick={() => setCategory('all')}
          >
            All Products
          </button>
          <button 
            className={category === 'cookies' ? 'active' : ''}
            onClick={() => setCategory('cookies')}
          >
            Cookies
          </button>
          <button 
            className={category === 'cakes' ? 'active' : ''}
            onClick={() => setCategory('cakes')}
          >
            Cakes
          </button>
          <button 
            className={category === 'breads' ? 'active' : ''}
            onClick={() => setCategory('breads')}
          >
            Breads
          </button>
        </div>
      </div>

      <div className="products-grid">
        {products.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image">
              <img src={product.image_url} alt={product.name} />
              {product.subscription_eligible && (
                <div className="subscription-badge">
                  📅 Subscription Available
                </div>
              )}
            </div>
            <div className="product-info">
              <h3>{product.name}</h3>
              <p className="product-description">{product.description}</p>
              <div className="product-price">
                {product.regional_price.toFixed(2)} {product.currency}
              </div>
              <div className="product-actions">
                <button 
                  className="add-to-cart-btn"
                  onClick={() => handleAddToCart(product, 'one-time')}
                >
                  Add to Cart
                </button>
                {product.subscription_eligible && (
                  <div className="subscription-options">
                    <button 
                      className="subscription-btn"
                      onClick={() => handleAddToCart(product, 'weekly')}
                    >
                      Weekly
                    </button>
                    <button 
                      className="subscription-btn"
                      onClick={() => handleAddToCart(product, 'monthly')}
                    >
                      Monthly
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Cart = () => {
  const { cart, region, updateCartQuantity, removeFromCart } = useShopping();
  const [cartCalculation, setCartCalculation] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cart.length > 0) {
      calculateCart();
    } else {
      setCartCalculation(null);
    }
  }, [cart, region]);

  const calculateCart = async () => {
    try {
      setLoading(true);
      const cartItems = cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        subscription_type: item.subscription_type
      }));

      const response = await axios.post(`${API}/cart?region=${region}`, {
        items: cartItems
      });
      
      setCartCalculation(response.data);
    } catch (error) {
      console.error('Error calculating cart:', error);
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="cart-page">
        <div className="empty-cart">
          <h2>Your Cart is Empty</h2>
          <p>Add some delicious items to get started!</p>
          <Link to="/products" className="continue-shopping-btn">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1>Shopping Cart</h1>
      
      {loading ? (
        <div className="loading">Calculating prices...</div>
      ) : cartCalculation ? (
        <div className="cart-content">
          <div className="cart-items">
            {cartCalculation.items.map((item, index) => (
              <div key={`${item.product_id}-${item.subscription_type}`} className="cart-item">
                <div className="item-image">
                  <img src={item.product_image} alt={item.product_name} />
                </div>
                <div className="item-details">
                  <h3>{item.product_name}</h3>
                  <p className="item-type">
                    {item.subscription_type === 'one-time' ? 'One-time purchase' : 
                     `${item.subscription_type.charAt(0).toUpperCase() + item.subscription_type.slice(1)} subscription`}
                  </p>
                  <div className="quantity-controls">
                    <button 
                      onClick={() => updateCartQuantity(item.product_id, item.subscription_type, item.quantity - 1)}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button 
                      onClick={() => updateCartQuantity(item.product_id, item.subscription_type, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="item-price">
                  <div className="unit-price">{item.unit_price.toFixed(2)} {item.currency} each</div>
                  <div className="total-price">{item.total_price.toFixed(2)} {item.currency}</div>
                </div>
                <button 
                  className="remove-btn"
                  onClick={() => removeFromCart(item.product_id, item.subscription_type)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          
          <div className="cart-summary">
            <h3>Order Summary</h3>
            <div className="summary-line">
              <span>Subtotal:</span>
              <span>{cartCalculation.subtotal.toFixed(2)} {cartCalculation.currency}</span>
            </div>
            <div className="summary-line">
              <span>Tax:</span>
              <span>{cartCalculation.tax.toFixed(2)} {cartCalculation.currency}</span>
            </div>
            <div className="summary-line total">
              <span>Total:</span>
              <span>{cartCalculation.total.toFixed(2)} {cartCalculation.currency}</span>
            </div>
            <div className="delivery-info">
              <p>{cartCalculation.delivery_message}</p>
            </div>
            <button className="checkout-btn" disabled>
              Checkout (Coming Soon)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Admin = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/admin/products`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const token = localStorage.getItem('access_token');
      await axios.delete(`${API}/admin/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  if (loading) return <div className="loading">Loading admin panel...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <button 
          className="create-product-btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : 'Create Product'}
        </button>
      </div>

      {showCreateForm && (
        <CreateProductForm 
          onSuccess={() => {
            setShowCreateForm(false);
            fetchProducts();
          }}
        />
      )}

      <div className="admin-products">
        <h2>All Products</h2>
        <div className="products-table">
          {products.map(product => (
            <div key={product.id} className="product-row">
              <div className="product-image-small">
                <img src={product.image_url} alt={product.name} />
              </div>
              <div className="product-details">
                <h3>{product.name}</h3>
                <p>{product.category}</p>
                <p>{product.base_price} INR</p>
                <p>{product.subscription_eligible ? '✅ Subscription' : '❌ No Subscription'}</p>
                <p>{product.in_stock ? '✅ In Stock' : '❌ Out of Stock'}</p>
              </div>
              <div className="product-actions">
                <button 
                  className="delete-btn"
                  onClick={() => deleteProduct(product.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CreateProductForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'cookies',
    base_price: '',
    image_url: '',
    subscription_eligible: false,
    in_stock: true
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${API}/admin/products`, {
        ...formData,
        base_price: parseFloat(formData.base_price)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      onSuccess();
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Error creating product: ' + (error.response?.data?.detail || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="create-product-form" onSubmit={handleSubmit}>
      <h3>Create New Product</h3>
      
      <div className="form-group">
        <label>Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          required
        />
      </div>

      <div className="form-group">
        <label>Category</label>
        <select
          value={formData.category}
          onChange={(e) => setFormData({...formData, category: e.target.value})}
        >
          <option value="cookies">Cookies</option>
          <option value="cakes">Cakes</option>
          <option value="breads">Breads</option>
        </select>
      </div>

      <div className="form-group">
        <label>Base Price (INR)</label>
        <input
          type="number"
          step="0.01"
          value={formData.base_price}
          onChange={(e) => setFormData({...formData, base_price: e.target.value})}
          required
        />
      </div>

      <div className="form-group">
        <label>Image URL</label>
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({...formData, image_url: e.target.value})}
          required
        />
      </div>

      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.subscription_eligible}
            onChange={(e) => setFormData({...formData, subscription_eligible: e.target.checked})}
          />
          Subscription Eligible
        </label>
      </div>

      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.in_stock}
            onChange={(e) => setFormData({...formData, in_stock: e.target.checked})}
          />
          In Stock
        </label>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Product'}
      </button>
    </form>
  );
};

// Auth Pages (Login, Register, Profile, etc.) - keeping existing code
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(email, password);
    if (result.success) {
      navigate('/');
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
        
        <div className="demo-accounts">
          <p><strong>Demo Accounts:</strong></p>
          <p>Admin: admin@flintandflours.com / admin123</p>
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
    if (user) navigate('/');
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
            <p><strong>Admin Status:</strong> {user.is_admin ? '✅ Admin' : '👤 User'}</p>
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

// Initialize sample data component
const InitializeData = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const initializeData = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/init-data`);
      setMessage('Sample data initialized successfully!');
    } catch (error) {
      setMessage('Error initializing data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  return (
    <div className="init-data">
      {loading ? (
        <div className="loading">Initializing sample data...</div>
      ) : (
        <div className={message.includes('Error') ? 'error' : 'success'}>
          {message}
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <ShoppingProvider>
          <BrowserRouter>
            <Header />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/products" element={<Products />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={
                  <AdminRoute>
                    <Admin />
                  </AdminRoute>
                } />
                <Route path="/init" element={<InitializeData />} />
              </Routes>
            </main>
          </BrowserRouter>
        </ShoppingProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
