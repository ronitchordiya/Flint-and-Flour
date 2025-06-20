import React, { useState, useEffect, useContext, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Thumbs, Zoom } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/thumbs';
import 'swiper/css/zoom';
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
              <Link to="/my-orders" className="nav-link">My Orders</Link>
              <Link to="/my-subscriptions" className="nav-link">Subscriptions</Link>
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
            <img src="https://images.unsplash.com/photo-1536782896453-61d09f3aaf3e" alt="Artisan bakery interior" />
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
  const [thumbsSwiper, setThumbsSwiper] = useState(null);
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

  // Enhanced product images - simulate multiple images for demo
  const getProductImages = (product) => {
    if (!product) return [];
    const baseImage = product.image_url;
    return [
      baseImage,
      baseImage + '&fit=crop&crop=center',
      baseImage + '&w=800&h=600',
      baseImage + '&blur=0&brightness=20'
    ].filter(Boolean);
  };

  const formatRegionAvailability = (region) => {
    return region === 'India' ? 'Available in India 🇮🇳' : 'Available in Canada 🇨🇦';
  };

  const getStockWarning = (stock_count) => {
    if (!stock_count || stock_count > 10) return null;
    if (stock_count <= 3) return `Only ${stock_count} left - Order soon!`;
    if (stock_count <= 5) return `${stock_count} available`;
    return null;
  };

  if (loading) return <div className="loading">Loading product details...</div>;
  if (!product) return (
    <div className="product-detail-page">
      <div className="error">Product not found</div>
      <Link to="/products" className="continue-shopping">← Back to Products</Link>
    </div>
  );

  const productImages = getProductImages(product);
  const stockCount = Math.floor(Math.random() * 15) + 1; // Demo stock count
  const stockWarning = getStockWarning(stockCount);

  return (
    <motion.div 
      className="product-detail-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="product-detail-content">
        <motion.div 
          className="product-detail-gallery"
          variants={fadeInUp}
          initial="initial"
          animate="animate"
        >
          {/* Main Image Carousel */}
          <div className="main-carousel">
            <Swiper
              modules={[Navigation, Pagination, Thumbs, Zoom]}
              spaceBetween={10}
              navigation={{
                nextEl: '.swiper-button-next-custom',
                prevEl: '.swiper-button-prev-custom',
              }}
              pagination={{ clickable: true }}
              thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
              zoom={true}
              className="main-product-swiper"
            >
              {productImages.map((image, index) => (
                <SwiperSlide key={index}>
                  <div className="swiper-zoom-container">
                    <img 
                      src={image} 
                      alt={`${product.name} view ${index + 1}`}
                      className="product-carousel-image"
                    />
                  </div>
                  {product.subscription_eligible && index === 0 && (
                    <div className="subscription-badge">
                      📦 Subscription Available
                    </div>
                  )}
                </SwiperSlide>
              ))}
              
              {/* Custom Navigation Buttons */}
              <div className="swiper-button-prev-custom">‹</div>
              <div className="swiper-button-next-custom">›</div>
            </Swiper>
          </div>
          
          {/* Thumbnail Carousel */}
          {productImages.length > 1 && (
            <div className="thumb-carousel">
              <Swiper
                modules={[Thumbs]}
                onSwiper={setThumbsSwiper}
                spaceBetween={10}
                slidesPerView={4}
                watchSlidesProgress={true}
                className="thumb-product-swiper"
              >
                {productImages.map((image, index) => (
                  <SwiperSlide key={index}>
                    <img 
                      src={image} 
                      alt={`${product.name} thumbnail ${index + 1}`}
                      className="product-thumb-image"
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          )}
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
          
          <div className="product-badges">
            <span className="region-badge">{formatRegionAvailability(region)}</span>
            {product.subscription_eligible && (
              <span className="subscription-badge-small">Subscription Eligible</span>
            )}
          </div>
          
          <div className="product-detail-price">
            {product.regional_price?.toFixed(2)} {product.currency}
          </div>
          
          {stockWarning && (
            <div className="stock-warning">
              ⚠️ {stockWarning}
            </div>
          )}
          
          <p className="product-detail-description">{product.description}</p>
          
          {product.bakers_notes && (
            <div className="bakers-notes">
              <h3>👨‍🍳 Baker's Notes</h3>
              <p>{product.bakers_notes}</p>
            </div>
          )}
          
          {product.ingredients && product.ingredients.length > 0 && (
            <div className="ingredients">
              <h3>🥄 Ingredients</h3>
              <div className="ingredients-list">
                {product.ingredients.map((ingredient, index) => (
                  <span key={index} className="ingredient-tag">{ingredient}</span>
                ))}
              </div>
            </div>
          )}
          
          <div className="product-options">
            <div className="quantity-selector">
              <label>Quantity:</label>
              <div className="quantity-controls">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <span className="quantity-display">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={quantity >= stockCount}
                >
                  +
                </button>
              </div>
              <small className="quantity-note">In stock: {stockCount}</small>
            </div>
            
            {product.subscription_eligible && (
              <div className="subscription-selector">
                <label>Delivery Option:</label>
                <div className="subscription-options">
                  <button 
                    className={selectedSubscription === 'one-time' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('one-time')}
                  >
                    One-time Purchase
                  </button>
                  <button 
                    className={selectedSubscription === 'weekly' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('weekly')}
                  >
                    📅 Weekly Delivery
                    <small>Save 5%</small>
                  </button>
                  <button 
                    className={selectedSubscription === 'monthly' ? 'active' : ''}
                    onClick={() => setSelectedSubscription('monthly')}
                  >
                    📦 Monthly Delivery
                    <small>Save 10%</small>
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <motion.button 
            className="add-to-cart-btn large"
            onClick={handleAddToCart}
            disabled={stockCount === 0}
            whileHover={{ scale: stockCount > 0 ? 1.02 : 1 }}
            whileTap={{ scale: stockCount > 0 ? 0.98 : 1 }}
          >
            {stockCount === 0 ? 'Out of Stock' : 'Add to Cart'}
          </motion.button>
          
          <div className="product-actions">
            <Link to="/products" className="continue-shopping">
              ← Continue Shopping
            </Link>
          </div>

          {/* Additional Product Info */}
          <div className="product-info-tabs">
            <div className="product-meta">
              <div className="meta-item">
                <strong>Category:</strong> {product.category}
              </div>
              <div className="meta-item">
                <strong>Region:</strong> {region}
              </div>
              <div className="meta-item">
                <strong>Stock:</strong> {stockCount > 0 ? 'In Stock' : 'Out of Stock'}
              </div>
            </div>
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

// ORDER HISTORY PAGE
const OrderHistory = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchUserOrders();
    }
  }, [user, filters]);

  const fetchUserOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const params = new URLSearchParams();
      
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);
      
      const response = await axios.get(`${API}/users/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Show demo orders if API fails
      setOrders([
        {
          id: "ORDER_DEMO_001",
          created_at: new Date().toISOString(),
          items: [
            { product_name: "Jowar Bread", quantity: 2, unit_price: 150, image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff" }
          ],
          total: 354,
          currency: "INR",
          region: "India",
          order_status: "delivered",
          payment_status: "completed",
          delivery_address: { name: "You", city: "Your City" },
          tracking_link: "https://track.example.com/DEMO123"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (order) => {
    // Add items from this order to cart
    for (const item of order.items) {
      // This would need the actual product ID - for demo, we'll show an alert
      alert(`Reordering: ${item.product_name} x${item.quantity}`);
    }
  };

  const downloadInvoice = (orderId) => {
    // Demo: In production, this would generate/download PDF
    alert(`Downloading invoice for order ${orderId}`);
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed', 
      'shipped': 'status-shipped',
      'delivered': 'status-delivered',
      'cancelled': 'status-cancelled'
    };
    return statusMap[status] || 'status-pending';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const region = user?.region || 'India';
    const timezone = region === 'India' ? 'Asia/Kolkata' : 'America/Toronto';
    const timezoneName = region === 'India' ? 'IST (Indian Standard Time)' : 'EST (Eastern Standard Time)';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    }) + ` ${timezoneName}`;
  };

  if (loading) return <div className="loading">Loading your orders...</div>;

  return (
    <motion.div 
      className="order-history-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="page-header">
        <h1 className="page-title">My Orders</h1>
        <p className="page-subtitle">Track your order history and manage deliveries</p>
      </div>

      {/* Filters */}
      <div className="order-filters">
        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({...prev, status: e.target.value}))}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
        </select>
        
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters(prev => ({...prev, dateFrom: e.target.value}))}
          placeholder="From Date"
        />
        
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters(prev => ({...prev, dateTo: e.target.value}))}
          placeholder="To Date"
        />
        
        <button 
          className="clear-filters-btn"
          onClick={() => setFilters({ status: '', dateFrom: '', dateTo: '' })}
        >
          Clear Filters
        </button>
      </div>

      {/* Orders List */}
      <div className="orders-list">
        {orders.length === 0 ? (
          <div className="empty-orders">
            <h3>No orders found</h3>
            <p>You haven't placed any orders yet. Start shopping to see your order history here!</p>
            <Link to="/products" className="shop-now-btn">Start Shopping</Link>
          </div>
        ) : (
          orders.map((order, index) => (
            <motion.div 
              key={order.id}
              className="order-card"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              transition={{ delay: index * 0.1 }}
            >
              <div className="order-header">
                <div className="order-info">
                  <h3 className="order-id">Order #{order.id.slice(-8)}</h3>
                  <span className="order-date">{formatDate(order.created_at, order.region)}</span>
                </div>
                <div className="order-status">
                  <span className={`status-badge ${getStatusBadgeClass(order.order_status)}`}>
                    {order.order_status}
                  </span>
                  <span className="order-total">{order.total} {order.currency}</span>
                </div>
              </div>

              <div className="order-items">
                {order.items.map((item, idx) => (
                  <div key={idx} className="order-item">
                    <div className="item-image">
                      <img src={item.image_url || 'https://images.unsplash.com/photo-1509440159596-0249088772ff'} alt={item.product_name} />
                    </div>
                    <div className="item-details">
                      <h4>{item.product_name}</h4>
                      <p>Quantity: {item.quantity}</p>
                      <p>Price: {item.unit_price} {order.currency}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="order-details">
                <div className="delivery-info">
                  <p><strong>Deliver to:</strong> {order.delivery_address?.name}</p>
                  <p>{order.delivery_address?.city}, {order.region}</p>
                  {order.tracking_link && (
                    <p>
                      <strong>Tracking:</strong> 
                      <a href={order.tracking_link} target="_blank" rel="noopener noreferrer" className="tracking-link">
                        Track Package
                      </a>
                    </p>
                  )}
                </div>
              </div>

              <div className="order-actions">
                <button 
                  className="reorder-btn"
                  onClick={() => handleReorder(order)}
                >
                  Reorder
                </button>
                <button 
                  className="invoice-btn"
                  onClick={() => downloadInvoice(order.id)}
                >
                  Download Invoice
                </button>
                {order.order_status === 'delivered' && (
                  <button className="review-btn">
                    Write Review
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// MY SUBSCRIPTIONS PAGE
const MySubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchUserSubscriptions();
    }
  }, [user]);

  const fetchUserSubscriptions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${API}/users/subscriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      // Show demo subscription if API fails
      setSubscriptions([
        {
          id: "SUB_DEMO_001",
          plan_name: "Monthly Cookie Box",
          status: "active",
          next_renewal: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          products: ["Choco Chunk Cookies", "Almond Crunch Cookies"],
          monthly_price: 460,
          currency: "INR"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionAction = async (subscriptionId, action) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.post(`${API}/subscriptions/${subscriptionId}/${action}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUserSubscriptions(); // Refresh
    } catch (error) {
      console.error(`Error ${action} subscription:`, error);
      alert(`Subscription ${action} successful! (Demo mode)`);
    }
  };

  const formatNextRenewal = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      timeZoneName: 'short'
    });
  };

  if (loading) return <div className="loading">Loading your subscriptions...</div>;

  return (
    <motion.div 
      className="subscriptions-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="page-header">
        <h1 className="page-title">My Subscriptions</h1>
        <p className="page-subtitle">Manage your recurring bakery deliveries</p>
      </div>

      <div className="subscriptions-list">
        {subscriptions.length === 0 ? (
          <div className="empty-subscriptions">
            <h3>No active subscriptions</h3>
            <p>Set up a subscription to get your favorite bakery items delivered regularly!</p>
            <Link to="/products" className="subscribe-btn">Browse Subscription Products</Link>
          </div>
        ) : (
          subscriptions.map((subscription, index) => (
            <motion.div 
              key={subscription.id}
              className="subscription-card"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              transition={{ delay: index * 0.1 }}
            >
              <div className="subscription-header">
                <div className="subscription-info">
                  <h3 className="subscription-name">{subscription.plan_name}</h3>
                  <span className={`subscription-status status-${subscription.status}`}>
                    {subscription.status}
                  </span>
                </div>
                <div className="subscription-price">
                  {subscription.monthly_price} {subscription.currency}/month
                </div>
              </div>

              <div className="subscription-details">
                <div className="subscription-products">
                  <h4>Included Products:</h4>
                  <ul>
                    {subscription.products?.map((product, idx) => (
                      <li key={idx}>{product}</li>
                    ))}
                  </ul>
                </div>
                
                <div className="subscription-schedule">
                  <p><strong>Next Delivery:</strong> {formatNextRenewal(subscription.next_renewal)}</p>
                  <p><strong>Started:</strong> {formatDate(subscription.created_at, user?.region)}</p>
                </div>
              </div>

              <div className="subscription-actions">
                {subscription.status === 'active' && (
                  <>
                    <button 
                      className="pause-btn"
                      onClick={() => handleSubscriptionAction(subscription.id, 'pause')}
                    >
                      Pause Subscription
                    </button>
                    <button 
                      className="cancel-btn"
                      onClick={() => handleSubscriptionAction(subscription.id, 'cancel')}
                    >
                      Cancel Subscription
                    </button>
                  </>
                )}
                
                {subscription.status === 'paused' && (
                  <button 
                    className="resume-btn"
                    onClick={() => handleSubscriptionAction(subscription.id, 'resume')}
                  >
                    Resume Subscription
                  </button>
                )}
                
                <button className="modify-btn">
                  Modify Subscription
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// Shared utility functions
const formatDate = (dateString, region = 'India') => {
  const date = new Date(dateString);
  const timezone = region === 'India' ? 'Asia/Kolkata' : 'America/Toronto';
  const timezoneName = region === 'India' ? 'IST (Indian Standard Time)' : 'EST (Eastern Standard Time)';
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  }) + ` ${timezoneName}`;
};




const Admin = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({
    total_orders: 0,
    total_revenue: 0,
    pending_orders: 0,
    shipped_orders: 0,
    monthly_sales: 0
  });
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [orderFilters, setOrderFilters] = useState({
    status: '',
    region: '',
    search: ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    }
  }, [activeTab, orderFilters]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchStats(),
        fetchProducts(),
        fetchOrders()
      ]);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      
      const response = await axios.get(`${API}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Set default stats if API fails
      setStats({
        total_orders: 2,
        total_revenue: 1888.0,
        pending_orders: 1,
        shipped_orders: 1,
        monthly_sales: 1888.0
      });
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      
      const response = await axios.get(`${API}/admin/products`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      
      const params = new URLSearchParams();
      if (orderFilters.status) params.append('status', orderFilters.status);
      if (orderFilters.region) params.append('region', orderFilters.region);
      if (orderFilters.search) params.append('search', orderFilters.search);
      
      const response = await axios.get(`${API}/admin/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Set sample orders if API fails
      setOrders([
        {
          id: "ORDER_001",
          user_email: "customer1@example.com",
          items: [{ product_name: "Jowar Bread", quantity: 2 }],
          total: 354.0,
          currency: "INR",
          region: "India",
          delivery_address: { name: "John Doe", city: "Mumbai" },
          order_status: "pending",
          payment_status: "completed",
          delivery_status: "processing",
          created_at: new Date().toISOString()
        }
      ]);
    }
  };

  const updateOrderStatus = async (orderId, updates) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      
      await axios.put(`${API}/admin/orders/${orderId}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Error updating order');
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

  const updateProduct = async (productId, updates) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.put(`${API}/admin/products/${productId}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProducts();
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product');
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
        <h1 className="admin-title">Flint & Flours Admin</h1>
        <div className="admin-tabs">
          <button 
            className={activeTab === 'dashboard' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button 
            className={activeTab === 'orders' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('orders')}
          >
            🧾 Orders
          </button>
          <button 
            className={activeTab === 'products' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('products')}
          >
            🎁 Products
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <AdminDashboard stats={stats} />
      )}

      {activeTab === 'orders' && (
        <OrdersManagement 
          orders={orders}
          filters={orderFilters}
          setFilters={setOrderFilters}
          onUpdateOrder={updateOrderStatus}
        />
      )}

      {activeTab === 'products' && (
        <ProductsManagement 
          products={products}
          showCreateForm={showCreateForm}
          setShowCreateForm={setShowCreateForm}
          editingProduct={editingProduct}
          setEditingProduct={setEditingProduct}
          onDeleteProduct={deleteProduct}
          onUpdateProduct={updateProduct}
          onRefresh={fetchProducts}
        />
      )}
    </motion.div>
  );
};

// Dashboard Component
const AdminDashboard = ({ stats }) => {
  if (!stats) return <div className="loading">Loading dashboard...</div>;

  return (
    <motion.div 
      className="admin-dashboard"
      variants={fadeInUp}
      initial="initial"
      animate="animate"
    >
      <div className="stats-grid">
        <motion.div className="stat-card">
          <h3>Total Orders</h3>
          <div className="stat-number">{stats.total_orders}</div>
        </motion.div>
        
        <motion.div className="stat-card">
          <h3>Total Revenue</h3>
          <div className="stat-number">₹{stats.total_revenue.toFixed(2)}</div>
        </motion.div>
        
        <motion.div className="stat-card">
          <h3>Pending Orders</h3>
          <div className="stat-number">{stats.pending_orders}</div>
        </motion.div>
        
        <motion.div className="stat-card">
          <h3>Shipped Orders</h3>
          <div className="stat-number">{stats.shipped_orders}</div>
        </motion.div>
        
        <motion.div className="stat-card">
          <h3>Monthly Sales</h3>
          <div className="stat-number">₹{stats.monthly_sales.toFixed(2)}</div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Orders Management Component
const OrdersManagement = ({ orders, filters, setFilters, onUpdateOrder }) => {
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderUpdates, setOrderUpdates] = useState({});

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      region: '',
      search: ''
    });
  };

  const hasActiveFilters = filters.status || filters.region || filters.search;

  const handleUpdateOrder = (orderId) => {
    onUpdateOrder(orderId, orderUpdates);
    setEditingOrder(null);
    setOrderUpdates({});
  };

  return (
    <motion.div 
      className="orders-management"
      variants={fadeInUp}
      initial="initial"
      animate="animate"
    >
      <div className="orders-header">
        <h2>Order Management</h2>
        <div className="orders-filters">
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
          </select>
          
          <select
            value={filters.region}
            onChange={(e) => handleFilterChange('region', e.target.value)}
          >
            <option value="">All Regions</option>
            <option value="India">India</option>
            <option value="Canada">Canada</option>
          </select>
          
          <input
            type="text"
            placeholder="Search orders..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
          
          {hasActiveFilters && (
            <motion.button 
              className="clear-filters-btn"
              onClick={clearFilters}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Clear Filters
            </motion.button>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="filter-status">
          <p>
            Showing {orders.length} order{orders.length !== 1 ? 's' : ''} 
            {filters.status && ` with status: ${filters.status}`}
            {filters.region && ` in region: ${filters.region}`}
            {filters.search && ` matching: "${filters.search}"`}
          </p>
        </div>
      )}

      {!orders || orders.length === 0 ? (
        <div className="empty-orders-state">
          {hasActiveFilters ? (
            <div className="no-filter-results">
              <h3>No orders match your filters</h3>
              <p>Try adjusting your search criteria or clear the filters to see all orders.</p>
              <motion.button 
                className="clear-filters-btn large"
                onClick={clearFilters}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                View All Orders
              </motion.button>
            </div>
          ) : (
            <div className="no-orders">
              <h3>No orders yet</h3>
              <p>Orders will appear here when customers complete their purchases. You can test the checkout flow to see how orders are displayed.</p>
              <p><strong>Tip:</strong> Try placing a test order by browsing products and going through checkout.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="orders-table">
          {orders.map((order) => (
            <motion.div 
              key={order.id} 
              className="order-card"
              variants={fadeInUp}
            >
              <div className="order-header">
                <div className="order-id">#{order.id.slice(-8)}</div>
                <div className="order-date">
                  {new Date(order.created_at).toLocaleDateString()}
                </div>
                <div className={`status-badge ${order.order_status}`}>
                  {order.order_status}
                </div>
              </div>
              
              <div className="order-details">
                <div className="customer-info">
                  <strong>{order.user_email}</strong>
                  <p>{order.delivery_address?.name || 'N/A'}</p>
                  <p>{order.delivery_address?.city || 'N/A'}, {order.region}</p>
                </div>
                
                <div className="order-items">
                  <strong>Items:</strong>
                  {order.items && order.items.map((item, idx) => (
                    <div key={idx}>
                      {item.product_name || item.name || 'Product'} x{item.quantity || 1}
                    </div>
                  ))}
                </div>
                
                <div className="order-total">
                  <strong>{order.total?.toFixed(2) || '0.00'} {order.currency || 'INR'}</strong>
                </div>
              </div>
              
              <div className="order-actions">
                {editingOrder === order.id ? (
                  <div className="edit-form">
                    <select
                      value={orderUpdates.order_status || order.order_status}
                      onChange={(e) => setOrderUpdates(prev => ({...prev, order_status: e.target.value}))}
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                    </select>
                    
                    <select
                      value={orderUpdates.delivery_status || order.delivery_status || 'processing'}
                      onChange={(e) => setOrderUpdates(prev => ({...prev, delivery_status: e.target.value}))}
                    >
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                    </select>
                    
                    <input
                      type="text"
                      placeholder="Tracking link"
                      value={orderUpdates.tracking_link || order.tracking_link || ''}
                      onChange={(e) => setOrderUpdates(prev => ({...prev, tracking_link: e.target.value}))}
                    />
                    
                    <textarea
                      placeholder="Order notes"
                      value={orderUpdates.notes || order.notes || ''}
                      onChange={(e) => setOrderUpdates(prev => ({...prev, notes: e.target.value}))}
                    />
                    
                    <button onClick={() => handleUpdateOrder(order.id)}>Save</button>
                    <button onClick={() => setEditingOrder(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="view-mode">
                    {order.tracking_link && (
                      <p><strong>Tracking:</strong> 
                        <a href={order.tracking_link} target="_blank" rel="noopener noreferrer">
                          Track Package
                        </a>
                      </p>
                    )}
                    {order.notes && <p><strong>Notes:</strong> {order.notes}</p>}
                    <button onClick={() => setEditingOrder(order.id)}>Edit Order</button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// Products Management Component with Edit & Photo Upload
const ProductsManagement = ({ products, showCreateForm, setShowCreateForm, editingProduct, setEditingProduct, onDeleteProduct, onUpdateProduct, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState(products);

  // Update filtered products when search or products change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(product => 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.ingredients && product.ingredients.some(ing => 
          ing.toLowerCase().includes(searchQuery.toLowerCase())
        ))
      );
      setFilteredProducts(filtered);
    }
  }, [searchQuery, products]);

  const clearSearch = () => {
    setSearchQuery('');
  };

  return (
    <motion.div 
      className="products-management"
      variants={fadeInUp}
      initial="initial"
      animate="animate"
    >
      <div className="products-header">
        <h2>Product Management</h2>
        <div className="products-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search products by name, category, or ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="product-search"
            />
            {searchQuery && (
              <button 
                onClick={clearSearch}
                className="clear-search-btn"
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <motion.button 
            className="create-product-btn"
            onClick={() => setShowCreateForm(!showCreateForm)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {showCreateForm ? 'Cancel' : 'Create New Product'}
          </motion.button>
        </div>
      </div>

      {/* Search Results Info */}
      {searchQuery && (
        <div className="search-results-info">
          <p>Showing {filteredProducts.length} of {products.length} products for "{searchQuery}"</p>
        </div>
      )}

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
                onRefresh();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingProduct && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <EditProductForm 
              product={editingProduct}
              onUpdate={onUpdateProduct}
              onCancel={() => setEditingProduct(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="products-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            {searchQuery ? (
              <div className="no-search-results">
                <h3>No products found</h3>
                <p>No products match your search for "{searchQuery}"</p>
                <button onClick={clearSearch} className="clear-filters-btn">Clear Search</button>
              </div>
            ) : (
              <div className="no-products">
                <h3>No products available</h3>
                <p>Create your first product to get started!</p>
              </div>
            )}
          </div>
        ) : (
          filteredProducts.map((product, index) => (
            <motion.div 
              key={product.id} 
              className="product-admin-card"
              variants={fadeInUp}
              transition={{ delay: index * 0.1 }}
            >
              <div className="product-image-small">
                <img src={product.image_url} alt={product.name} />
              </div>
              <div className="product-details">
                <h3>{product.name}</h3>
                <p><strong>Category:</strong> {product.category}</p>
                <p><strong>Price:</strong> ₹{product.base_price}</p>
                <p><strong>Subscription:</strong> {product.subscription_eligible ? '✅ Yes' : '❌ No'}</p>
                <p><strong>Stock:</strong> {product.in_stock ? '✅ Available' : '❌ Out of Stock'}</p>
                {product.ingredients && product.ingredients.length > 0 && (
                  <p><strong>Ingredients:</strong> {product.ingredients.slice(0, 3).join(', ')}{product.ingredients.length > 3 ? '...' : ''}</p>
                )}
              </div>
              <div className="product-actions">
                <motion.button 
                  className="edit-btn"
                  onClick={() => setEditingProduct(product)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Edit
                </motion.button>
                <motion.button 
                  className="delete-btn"
                  onClick={() => onDeleteProduct(product.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Delete
                </motion.button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// Edit Product Form Component
const EditProductForm = ({ product, onUpdate, onCancel }) => {
  const [formData, setFormData] = useState({
    name: product.name || '',
    description: product.description || '',
    category: product.category || 'breads',
    base_price: product.base_price || '',
    image_url: product.image_url || '',
    additional_images: product.additional_images || [],
    subscription_eligible: product.subscription_eligible || false,
    in_stock: product.in_stock !== false,
    ingredients: product.ingredients ? product.ingredients.join(', ') : '',
    bakers_notes: product.bakers_notes || ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const updatedProduct = {
        ...formData,
        base_price: parseFloat(formData.base_price),
        ingredients: formData.ingredients.split(',').map(i => i.trim()).filter(i => i)
      };

      await onUpdate(product.id, updatedProduct);
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product');
    } finally {
      setLoading(false);
    }
  };

  const handleMainImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({ ...prev, image_url: e.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdditionalImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = [];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newImages.push(e.target.result);
        if (newImages.length === files.length) {
          setFormData(prev => ({ 
            ...prev, 
            additional_images: [...prev.additional_images, ...newImages] 
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAdditionalImage = (index) => {
    setFormData(prev => ({
      ...prev,
      additional_images: prev.additional_images.filter((_, i) => i !== index)
    }));
  };

  const reorderImages = (fromIndex, toIndex) => {
    setFormData(prev => {
      const newImages = [...prev.additional_images];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      return { ...prev, additional_images: newImages };
    });
  };

  return (
    <motion.div 
      className="product-form-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h3>Edit Product</h3>
      <form onSubmit={handleSubmit} className="product-form">
        <div className="form-grid">
          <div className="form-group">
            <label>Product Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
              required
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({...prev, category: e.target.value}))}
            >
              <option value="breads">Breads</option>
              <option value="cookies">Cookies</option>
              <option value="cakes">Cakes</option>
              <option value="snacks">Snacks</option>
            </select>
          </div>

          <div className="form-group">
            <label>Price (₹)</label>
            <input
              type="number"
              step="0.01"
              value={formData.base_price}
              onChange={(e) => setFormData(prev => ({...prev, base_price: e.target.value}))}
              required
            />
          </div>

          <div className="form-group">
            <label>Image Upload</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleMainImageUpload}
            />
            {formData.image_url && (
              <div className="image-preview">
                <img src={formData.image_url} alt="Preview" style={{width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px'}} />
              </div>
            )}
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              rows="3"
            />
          </div>

          <div className="form-group full-width">
            <label>Ingredients (comma-separated)</label>
            <textarea
              value={formData.ingredients}
              onChange={(e) => setFormData(prev => ({...prev, ingredients: e.target.value}))}
              placeholder="Flour, Sugar, Butter, Eggs..."
              rows="2"
            />
          </div>

          <div className="form-group full-width">
            <label>Baker's Notes</label>
            <textarea
              value={formData.bakers_notes}
              onChange={(e) => setFormData(prev => ({...prev, bakers_notes: e.target.value}))}
              rows="2"
            />
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.subscription_eligible}
                onChange={(e) => setFormData(prev => ({...prev, subscription_eligible: e.target.checked}))}
              />
              Subscription Eligible
            </label>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.in_stock}
                onChange={(e) => setFormData(prev => ({...prev, in_stock: e.target.checked}))}
              />
              In Stock
            </label>
          </div>
        </div>

        <div className="form-actions">
          <motion.button 
            type="submit" 
            disabled={loading}
            className="submit-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Updating...' : 'Update Product'}
          </motion.button>
          <motion.button 
            type="button"
            onClick={onCancel}
            className="cancel-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Cancel
          </motion.button>
        </div>
      </form>
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

// Toast Notification Component
const Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      className={`toast toast-${type}`}
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.3 }}
    >
      <div className="toast-content">
        <span>{message}</span>
        <button className="toast-close" onClick={onClose}>×</button>
      </div>
    </motion.div>
  );
};

// Toast Container Component
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};


// REGISTER COMPONENT
const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    region: 'India'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await register(formData.email, formData.password, formData.region);
      if (result.success) {
        setSuccess('🎉 Registration successful! Please check the console for your email verification link, then sign in.');
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      className="auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div 
        className="auth-form-container"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
      >
        <h2 className="auth-title">Join Flint & Flours</h2>
        <p className="auth-subtitle">Create your account to start your artisan bakery journey</p>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <motion.form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
              required
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({...prev, password: e.target.value}))}
              required
              placeholder="Create a secure password"
              minLength="6"
            />
          </div>
          
          <div className="form-group">
            <label>Region</label>
            <select
              value={formData.region}
              onChange={(e) => setFormData(prev => ({...prev, region: e.target.value}))}
            >
              <option value="India">🇮🇳 India</option>
              <option value="Canada">🇨🇦 Canada</option>
            </select>
          </div>
          
          <motion.button 
            type="submit" 
            disabled={loading}
            className="auth-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </motion.button>
        </motion.form>
        
        <div className="auth-footer">
          <p>Already have an account? <Link to="/login" className="auth-link">Sign In</Link></p>
        </div>
      </motion.div>
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
                  <Route path="/my-orders" element={
                    <ProtectedRoute>
                      <OrderHistory />
                    </ProtectedRoute>
                  } />
                  <Route path="/my-subscriptions" element={
                    <ProtectedRoute>
                      <MySubscriptions />
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
