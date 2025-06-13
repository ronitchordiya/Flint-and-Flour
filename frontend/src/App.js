import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, Link, useParams } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -30 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

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
    <motion.header 
      className="header"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="header-content">
        <Link to="/" className="logo">
          Flint & Flours
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
          <Link to="/products" className="nav-link">Our Collection</Link>
          <Link to="/cart" className="nav-link cart-link">
            Cart ({getCartTotal()})
          </Link>
          
          {user ? (
            <div className="user-menu">
              <span className="user-info">
                {user.email.split('@')[0]}
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
    </motion.header>
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
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <motion.div 
            className="hero-text"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="hero-title">Where tradition meets artistry</h1>
            <p className="hero-subtitle">
              Hand-crafted with love, baked with passion. Each creation tells a story of timeless recipes 
              and modern innovation, bringing the warmth of our bakery to your table.
            </p>
            
            {deliveryInfo && (
              <motion.div 
                className="delivery-banner"
                variants={scaleIn}
                initial="initial"
                animate="animate"
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <p className="delivery-message">{deliveryInfo.message}</p>
              </motion.div>
            )}
            
            <div className="hero-buttons">
              <Link to="/products" className="hero-cta">Explore Our Collection</Link>
              {!user && (
                <Link to="/register" className="hero-cta-secondary">Join Our Story</Link>
              )}
            </div>
            
            {user && (
              <motion.div 
                className="welcome-user"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <h3>Welcome back, {user.email.split('@')[0]}!</h3>
                <p>Your region: <strong>{user.region}</strong></p>
                {!user.is_email_verified && (
                  <div className="verification-notice">
                    <h4>⚠️ Email Verification Required</h4>
                    <p>Please check the console logs for your email verification link.</p>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
          
          <motion.div 
            className="hero-image"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <img src="https://images.unsplash.com/photo-1555507036-ab794f4ade50?ixlib=rb-4.0.3" alt="Artisan bakery interior" />
          </motion.div>
        </div>
      </section>

      {/* Story Section */}
      <motion.section 
        className="story-section"
        variants={fadeInUp}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="story-content">
          <h2 className="story-title">Our Story</h2>
          <p className="story-text">
            Born from a passion for authentic flavors and artisanal techniques, Flint & Flours bridges 
            the culinary heritage of India and Canada. Every morning, our bakers knead traditions into 
            each loaf, whisper secrets into every pastry, and pour love into every creation.
          </p>
        </div>
      </motion.section>

      {/* Features Section */}
      <motion.section 
        className="features-section"
        variants={staggerContainer}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
      >
        <div className="features-content">
          <motion.h2 
            className="features-title"
            variants={fadeInUp}
          >
            Crafted with Care
          </motion.h2>
          
          <div className="features-grid">
            <motion.div className="feature-card" variants={fadeInUp}>
              <span className="feature-icon">🍪</span>
              <h3>Artisan Cookies</h3>
              <p>Hand-rolled and baked to perfection, each cookie carries the essence of time-honored recipes with a modern twist.</p>
            </motion.div>
            
            <motion.div className="feature-card" variants={fadeInUp}>
              <span className="feature-icon">🎂</span>
              <h3>Celebration Cakes</h3>
              <p>From intimate gatherings to grand celebrations, our cakes are crafted to make every moment unforgettable.</p>
            </motion.div>
            
            <motion.div className="feature-card" variants={fadeInUp}>
              <span className="feature-icon">🍞</span>
              <h3>Artisan Breads</h3>
              <p>Daily-baked with ancient grains and modern techniques, bringing the soul of traditional bakeries to your table.</p>
            </motion.div>
            
            <motion.div className="feature-card" variants={fadeInUp}>
              <span className="feature-icon">🔄</span>
              <h3>Fresh Subscriptions</h3>
              <p>Never run out of your favorites. Our subscription service ensures fresh delights delivered to your doorstep.</p>
            </motion.div>
          </div>
        </div>
      </motion.section>
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

  const getCategoryTitle = (cat) => {
    const titles = {
      'all': 'Our Complete Collection',
      'cookies': 'Artisan Cookies',
      'cakes': 'Celebration Cakes', 
      'breads': 'Fresh Breads'
    };
    return titles[cat] || 'Our Collection';
  };

  const getCategoryDescription = (cat) => {
    const descriptions = {
      'all': 'Discover our full range of handcrafted delights, each made with love and the finest ingredients.',
      'cookies': 'Hand-rolled and baked to perfection, each cookie tells a story of tradition and taste.',
      'cakes': 'From intimate celebrations to grand occasions, our cakes make every moment special.',
      'breads': 'Daily-baked artisan breads that bring the warmth of our bakery to your table.'
    };
    return descriptions[cat] || '';
  };

  if (loading) return <div className="loading">Discovering fresh delights...</div>;

  return (
    <motion.div 
      className="products-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="products-header">
        <motion.h1 
          className="products-title"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
        >
          {getCategoryTitle(category)}
        </motion.h1>
        
        <motion.p
          variants={fadeInUp}
          initial="initial" 
          animate="animate"
          transition={{ delay: 0.2 }}
          style={{ marginBottom: '2rem', color: 'var(--soft-gray)', textAlign: 'center' }}
        >
          {getCategoryDescription(category)}
        </motion.p>
        
        <motion.div 
          className="category-filters"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.3 }}
        >
          {[
            { key: 'all', label: 'All Collections' },
            { key: 'cookies', label: 'Cookies' },
            { key: 'cakes', label: 'Cakes' },
            { key: 'breads', label: 'Breads' }
          ].map(({ key, label }) => (
            <button 
              key={key}
              className={`category-filter ${category === key ? 'active' : ''}`}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </motion.div>
      </div>

      <motion.div 
        className="products-grid"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <AnimatePresence>
          {products.map(product => (
            <motion.div 
              key={product.id} 
              className="product-card"
              variants={fadeInUp}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <div className="product-image">
                <img src={product.image_url} alt={product.name} />
                {product.subscription_eligible && (
                  <div className="subscription-badge">
                    📅 Subscription Available
                  </div>
                )}
              </div>
              <div className="product-info">
                <h3 className="product-name">{product.name}</h3>
                <p className="product-description">{product.description}</p>
                <div className="product-price">
                  {product.regional_price.toFixed(2)} {product.currency}
                </div>
                <div className="product-actions">
                  <motion.button 
                    className="add-to-cart-btn"
                    onClick={() => handleAddToCart(product, 'one-time')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Add to Cart
                  </motion.button>
                  {product.subscription_eligible && (
                    <div className="subscription-options">
                      <motion.button 
                        className="subscription-btn"
                        onClick={() => handleAddToCart(product, 'weekly')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Weekly
                      </motion.button>
                      <motion.button 
                        className="subscription-btn"
                        onClick={() => handleAddToCart(product, 'monthly')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Monthly
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

// NEW: Product Detail Page
const ProductDetail = () => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubscription, setSelectedSubscription] = useState('one-time');
  const [quantity, setQuantity] = useState(1);
  const { region, addToCart } = useShopping();

  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId, region]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/products/${productId}?region=${region}`);
      setProduct(response.data);
    } catch (error) {
      console.error('Error fetching product:', error);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (product) {
      addToCart(product, quantity, selectedSubscription);
      alert('Added to cart!');
    }
  };

  if (loading) return <div className="loading">Loading product details...</div>;
  if (!product) return (
    <div className="product-detail-page">
      <div className="error">Product not found</div>
      <Link to="/products" className="continue-shopping">← Back to Products</Link>
    </div>
  );

  return (
    <motion.div 
      className="product-detail-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="product-detail-content">
        <motion.div 
          className="product-detail-image"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
        >
          <img src={product.image_url} alt={product.name} />
        </motion.div>
        
        <motion.div 
          className="product-detail-info"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
        >
          <div className="breadcrumb">
            <Link to="/products">Our Collection</Link> / {product.category} / {product.name}
          </div>
          
          <h1 className="product-detail-title">{product.name}</h1>
          
          <div className="product-detail-price">
            {product.regional_price?.toFixed(2)} {product.currency}
          </div>
          
          <p className="product-detail-description">{product.description}</p>
          
          {product.bakers_notes && (
            <div className="bakers-notes">
              <h3>Baker's Notes</h3>
              <p>{product.bakers_notes}</p>
            </div>
          )}
          
          {product.ingredients && product.ingredients.length > 0 && (
            <div className="ingredients">
              <h3>Ingredients</h3>
              <ul>
                {product.ingredients.map((ingredient, index) => (
                  <li key={index}>{ingredient}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="product-options">
            <div className="quantity-selector">
              <label>Quantity:</label>
              <div className="quantity-controls">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)}>+</button>
              </div>
            </div>
            
            {product.subscription_eligible && (
              <div className="subscription-selector">
                <label>Delivery:</label>
                <div className="subscription-options">
                  <button 
                    className={selectedSubscription === 'one-time' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('one-time')}
                  >
                    One-time
                  </button>
                  <button 
                    className={selectedSubscription === 'weekly' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('weekly')}
                  >
                    Weekly
                  </button>
                  <button 
                    className={selectedSubscription === 'monthly' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('monthly')}
                  >
                    Monthly
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <motion.button 
            className="add-to-cart-btn large"
            onClick={handleAddToCart}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Add to Cart
          </motion.button>
          
          <div className="product-actions">
            <Link to="/products" className="continue-shopping">
              ← Continue Shopping
            </Link>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// NEW: Checkout Component
const Checkout = () => {
  const { cart, region } = useShopping();
  const [loading, setLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    country: region === 'India' ? 'India' : 'Canada'
  });

  const handleCheckout = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const cartItems = cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        subscription_type: item.subscription_type
      }));

      const response = await axios.post(`${API}/payments/checkout`, {
        cart_items: cartItems,
        delivery_address: deliveryAddress,
        region: region,
        user_email: deliveryAddress.email
      });

      // Handle payment gateway redirection
      if (response.data.checkout_url) {
        // Stripe checkout
        window.location.href = response.data.checkout_url;
      } else if (response.data.payment_gateway === 'razorpay') {
        // Razorpay checkout
        alert('Razorpay integration would be implemented here for India payments');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Checkout error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <motion.div className="checkout-page">
        <div className="empty-cart">
          <h2>Your cart is empty</h2>
          <Link to="/products" className="continue-shopping-btn">
            Continue Shopping
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="checkout-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <h1 className="checkout-title">Secure Checkout</h1>
      
      <form onSubmit={handleCheckout} className="checkout-form">
        <div className="delivery-details">
          <h3>Delivery Information</h3>
          
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              value={deliveryAddress.name}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, name: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={deliveryAddress.email}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, email: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              value={deliveryAddress.phone}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, phone: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Address</label>
            <textarea
              value={deliveryAddress.address}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, address: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              value={deliveryAddress.city}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, city: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Postal Code</label>
            <input
              type="text"
              value={deliveryAddress.postal_code}
              onChange={(e) => setDeliveryAddress({...deliveryAddress, postal_code: e.target.value})}
              required
            />
          </div>
        </div>
        
        <motion.button 
          type="submit" 
          disabled={loading}
          className="checkout-btn large"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? 'Processing...' : `Proceed to Payment (${region})`}
        </motion.button>
      </form>
    </motion.div>
  );
};

// NEW: Order Confirmation Component  
const OrderConfirmation = () => {
  const [loading, setLoading] = useState(true);
  const [orderStatus, setOrderStatus] = useState(null);
  
  useEffect(() => {
    // Simulate order confirmation check
    setTimeout(() => {
      setOrderStatus({
        success: true,
        orderNumber: 'FL' + Math.random().toString().substr(2, 8),
        message: 'Your order has been confirmed!'
      });
      setLoading(false);
    }, 2000);
  }, []);

  if (loading) {
    return (
      <motion.div className="order-confirmation-page">
        <div className="loading">Processing your order...</div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="order-confirmation-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="confirmation-content">
        <h1>🎉 Order Confirmed!</h1>
        <p>Thank you for choosing Flint & Flours!</p>
        <div className="order-details">
          <p><strong>Order Number:</strong> {orderStatus?.orderNumber}</p>
          <p>You will receive an email confirmation shortly.</p>
        </div>
        <Link to="/products" className="continue-shopping-btn">
          Continue Shopping
        </Link>
      </div>
    </motion.div>
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
      <motion.div 
        className="cart-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="empty-cart">
          <h2>Your cart awaits</h2>
          <p>Fill it with our handcrafted delights and make every moment special.</p>
          <Link to="/products" className="continue-shopping-btn">
            Discover Our Collection
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="cart-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h1 
        className="cart-title"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
      >
        Your Selections
      </motion.h1>
      
      {loading ? (
        <div className="loading">Calculating your order...</div>
      ) : cartCalculation ? (
        <motion.div 
          className="cart-content"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
        >
          <div className="cart-items">
            {cartCalculation.items.map((item, index) => (
              <motion.div 
                key={`${item.product_id}-${item.subscription_type}`} 
                className="cart-item"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                transition={{ delay: index * 0.1 }}
              >
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
              </motion.div>
            ))}
          </div>
          
          <motion.div 
            className="cart-summary"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.4 }}
          >
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
            <motion.button 
              className="checkout-btn"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link to="/checkout" style={{ color: 'inherit', textDecoration: 'none' }}>
                Proceed to Checkout
              </Link>
            </motion.button>
          </motion.div>
        </motion.div>
      ) : null}
    </motion.div>
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
    <motion.div 
      className="admin-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="admin-header">
        <h1 className="admin-title">Bakery Management</h1>
        <motion.button 
          className="create-product-btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {showCreateForm ? 'Cancel' : 'Create New Product'}
        </motion.button>
      </div>

      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CreateProductForm 
              onSuccess={() => {
                setShowCreateForm(false);
                fetchProducts();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="admin-products">
        <h2>Product Collection</h2>
        <motion.div 
          className="products-table"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {products.map((product, index) => (
            <motion.div 
              key={product.id} 
              className="product-row"
              variants={fadeInUp}
              transition={{ delay: index * 0.1 }}
            >
              <div className="product-image-small">
                <img src={product.image_url} alt={product.name} />
              </div>
              <div className="product-details">
                <h3>{product.name}</h3>
                <p><strong>Category:</strong> {product.category}</p>
                <p><strong>Price:</strong> {product.base_price} INR</p>
                <p>{product.subscription_eligible ? '✅ Subscription Available' : '❌ No Subscription'}</p>
                <p>{product.in_stock ? '✅ In Stock' : '❌ Out of Stock'}</p>
              </div>
              <div className="product-actions">
                <motion.button 
                  className="delete-btn"
                  onClick={() => deleteProduct(product.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Delete
                </motion.button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
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
    <motion.form 
      className="create-product-form" 
      onSubmit={handleSubmit}
      variants={scaleIn}
      initial="initial"
      animate="animate"
    >
      <h3>Create New Product</h3>
      
      <div className="form-group">
        <label>Product Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required
          placeholder="Enter product name"
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          required
          placeholder="Describe your product..."
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
          placeholder="0.00"
        />
      </div>

      <div className="form-group">
        <label>Image URL</label>
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({...formData, image_url: e.target.value})}
          required
          placeholder="https://..."
        />
      </div>

      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.subscription_eligible}
            onChange={(e) => setFormData({...formData, subscription_eligible: e.target.checked})}
          />
          Available for subscription
        </label>
      </div>

      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.in_stock}
            onChange={(e) => setFormData({...formData, in_stock: e.target.checked})}
          />
          Currently in stock
        </label>
      </div>

      <motion.button 
        type="submit" 
        disabled={loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {loading ? 'Creating...' : 'Create Product'}
      </motion.button>
    </motion.form>
  );
};

// Auth Pages
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
    <motion.div 
      className="auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.form 
        className="auth-form" 
        onSubmit={handleSubmit}
        variants={scaleIn}
        initial="initial"
        animate="animate"
      >
        <h2>Welcome Back</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--soft-gray)' }}>
          Sign in to continue your culinary journey
        </p>
        
        {error && <div className="error">{error}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
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
            placeholder="Enter your password"
          />
        </div>

        <motion.button 
          type="submit" 
          disabled={loading} 
          className="submit-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </motion.button>

        <div className="auth-links">
          <Link to="/register">New to Flint & Flours? Create an account</Link>
          <Link to="/reset-password">Forgot your password?</Link>
        </div>
        
        <div className="demo-accounts">
          <p><strong>Demo Access:</strong></p>
          <p>Admin: admin@flintandflours.com / admin123</p>
        </div>
      </motion.form>
    </motion.div>
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
      setSuccess('Welcome to Flint & Flours! Please check the console for your email verification link, then sign in.');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <motion.div 
      className="auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.form 
        className="auth-form" 
        onSubmit={handleSubmit}
        variants={scaleIn}
        initial="initial"
        animate="animate"
      >
        <h2>Join Our Story</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--soft-gray)' }}>
          Become part of our artisanal baking community
        </p>
        
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
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
          <label htmlFor="region">Your Region</label>
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

        <motion.button 
          type="submit" 
          disabled={loading} 
          className="submit-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </motion.button>

        <div className="auth-links">
          <Link to="/login">Already have an account? Sign in</Link>
        </div>
      </motion.form>
    </motion.div>
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
    <motion.div 
      className="profile-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div 
        className="profile-container"
        variants={scaleIn}
        initial="initial"
        animate="animate"
      >
        <div className="profile-header">
          <h2>Your Profile</h2>
          <p>Manage your account and preferences</p>
        </div>
        
        <div className="profile-info">
          <div className="info-card">
            <h3>Account Information</h3>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Current Region:</strong> {user.region}</p>
            <p><strong>Email Verified:</strong> {user.is_email_verified ? '✅ Verified' : '⚠️ Pending'}</p>
            <p><strong>Account Type:</strong> {user.is_admin ? '✅ Administrator' : '👤 Customer'}</p>
            <p><strong>Member Since:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
          </div>

          {!user.is_email_verified && (
            <div className="verification-notice">
              <h4>⚠️ Email Verification Required</h4>
              <p>Please check the console logs for your email verification link to activate your account.</p>
            </div>
          )}
        </div>

        <form className="profile-form" onSubmit={handleUpdateProfile}>
          <h3>Update Preferences</h3>
          {message && <div className={message.includes('Error') ? 'error' : 'success'}>{message}</div>}
          
          <div className="form-group">
            <label htmlFor="region">Regional Preference</label>
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

          <motion.button 
            type="submit" 
            disabled={loading} 
            className="submit-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </motion.button>
        </form>

        <div className="profile-actions">
          <motion.button 
            onClick={handleLogout} 
            className="logout-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Sign Out
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
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
      setMessage('If the email exists in our system, a reset link has been sent. Please check the console logs.');
    } catch (error) {
      setMessage('Error sending reset link. Please try again.');
    }
    setLoading(false);
  };

  return (
    <motion.div 
      className="auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.form 
        className="auth-form" 
        onSubmit={handleSubmit}
        variants={scaleIn}
        initial="initial"
        animate="animate"
      >
        <h2>Reset Password</h2>
        <p style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--soft-gray)' }}>
          Enter your email to receive a reset link
        </p>
        
        {message && <div className="info">{message}</div>}
        
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
          />
        </div>

        <motion.button 
          type="submit" 
          disabled={loading} 
          className="submit-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </motion.button>

        <div className="auth-links">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </motion.form>
    </motion.div>
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
    <motion.div 
      className="init-data"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {loading ? (
        <div className="loading">Preparing your bakery experience...</div>
      ) : (
        <div className={message.includes('Error') ? 'error' : 'success'}>
          {message}
        </div>
      )}
    </motion.div>
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
              <AnimatePresence mode="wait">
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/:productId" element={<ProductDetail />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order-confirmation" element={<OrderConfirmation />} />
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
              </AnimatePresence>
            </main>
          </BrowserRouter>
        </ShoppingProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
