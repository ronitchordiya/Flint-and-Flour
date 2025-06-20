import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Star, Heart } from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Thumbs, Zoom } from 'swiper/modules';
import { useShopping, useToast } from '../App';

const ProductModal = ({ product, isOpen, onClose }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSubscription, setSelectedSubscription] = useState('one-time');
  const [thumbsSwiper, setThumbsSwiper] = useState(null);
  const { addToCart, region, formatPrice } = useShopping();
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!product) return null;

  const getProductImages = (product) => {
    const images = [];
    
    if (product.image_url) {
      images.push(product.image_url);
    }
    
    if (product.additional_images && product.additional_images.length > 0) {
      images.push(...product.additional_images);
    }
    
    // If we only have one image, don't create variants for the modal
    return images.filter(Boolean);
  };

  const productImages = getProductImages(product);
  const hasMultipleImages = productImages.length > 1;

  const handleAddToCart = () => {
    addToCart(product, quantity, selectedSubscription);
    const subscriptionText = selectedSubscription !== 'one-time' ? ` (${selectedSubscription} subscription)` : '';
    addToast(`Added ${quantity} ${product.name}${subscriptionText} to cart!`, 'success');
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-md hover:bg-white transition-colors"
            >
              <X className="w-5 h-5 text-charcoal" />
            </button>

            <div className="flex flex-col lg:flex-row overflow-y-auto max-h-[90vh]">
              {/* Image Section */}
              <div className="lg:w-1/2 bg-warm-white">
                {hasMultipleImages ? (
                  <div className="p-6">
                    {/* Main Image Swiper */}
                    <Swiper
                      style={{
                        '--swiper-navigation-color': 'var(--mocha)',
                        '--swiper-pagination-color': 'var(--mocha)',
                      }}
                      spaceBetween={10}
                      navigation={true}
                      thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                      modules={[Navigation, Pagination, Thumbs, Zoom]}
                      className="main-product-swiper mb-4 rounded-xl overflow-hidden"
                      zoom={true}
                    >
                      {productImages.map((image, index) => (
                        <SwiperSlide key={index}>
                          <div className="swiper-zoom-container">
                            <img
                              src={image}
                              alt={`${product.name} - Image ${index + 1}`}
                              className="w-full h-80 object-cover cursor-zoom-in"
                            />
                          </div>
                        </SwiperSlide>
                      ))}
                    </Swiper>

                    {/* Thumbnail Swiper */}
                    <Swiper
                      onSwiper={setThumbsSwiper}
                      spaceBetween={10}
                      slidesPerView={4}
                      freeMode={true}
                      watchSlidesProgress={true}
                      modules={[Navigation, Thumbs]}
                      className="thumb-swiper"
                    >
                      {productImages.map((image, index) => (
                        <SwiperSlide key={index}>
                          <img
                            src={image}
                            alt={`${product.name} thumbnail ${index + 1}`}
                            className="w-full h-20 object-cover rounded-lg cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                          />
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  </div>
                ) : (
                  <div className="p-6">
                    <img
                      src={productImages[0]}
                      alt={product.name}
                      className="w-full h-96 object-cover rounded-xl"
                    />
                  </div>
                )}
              </div>

              {/* Content Section */}
              <div className="lg:w-1/2 p-6 flex flex-col">
                <div className="flex-1">
                  {/* Product Header */}
                  <div className="mb-6">
                    <div className="flex items-start justify-between mb-2">
                      <h2 className="text-3xl font-serif font-bold text-charcoal">{product.name}</h2>
                      <button className="p-2 hover:bg-warm-white rounded-full transition-colors">
                        <Heart className="w-5 h-5 text-soft-gray hover:text-dusty-rose" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-2xl font-bold text-mocha">
                        {formatPrice(product.regional_price)}
                      </span>
                      {product.subscription_eligible && (
                        <span className="bg-sage-green/20 text-sage-green px-3 py-1 rounded-full text-sm font-medium">
                          Subscription Available
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-current" />
                        ))}
                      </div>
                      <span className="text-sm text-soft-gray">(4.8 • 124 reviews)</span>
                    </div>

                    <p className="text-soft-gray text-base leading-relaxed mb-6">{product.description}</p>
                    
                    {product.bakers_notes && (
                      <div className="bg-warm-white p-4 rounded-lg mb-6">
                        <h4 className="font-semibold text-mocha mb-2">Baker's Notes</h4>
                        <p className="text-sm text-soft-gray">{product.bakers_notes}</p>
                      </div>
                    )}

                    {product.ingredients && product.ingredients.length > 0 && (
                      <div className="mb-6">
                        <h4 className="font-semibold text-mocha mb-2">Ingredients</h4>
                        <div className="flex flex-wrap gap-2">
                          {product.ingredients.map((ingredient, index) => (
                            <span
                              key={index}
                              className="bg-soft-beige px-3 py-1 rounded-full text-sm text-charcoal"
                            >
                              {ingredient}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stock Status */}
                  {!product.in_stock && (
                    <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
                      <p className="font-medium">Out of Stock</p>
                      <p className="text-sm">This item is currently unavailable. Check back soon!</p>
                    </div>
                  )}
                </div>

                {/* Purchase Section */}
                {product.in_stock && (
                  <div className="border-t border-soft-beige pt-6">
                    {/* Subscription Toggle */}
                    {product.subscription_eligible && (
                      <div className="mb-6">
                        <h4 className="font-semibold text-mocha mb-3">Purchase Type</h4>
                        <div className="grid grid-cols-1 gap-3">
                          <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name="subscription"
                              value="one-time"
                              checked={selectedSubscription === 'one-time'}
                              onChange={(e) => setSelectedSubscription(e.target.value)}
                              className="w-4 h-4 text-mocha"
                            />
                            <span className="text-charcoal">One-time purchase</span>
                          </label>
                          <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name="subscription"
                              value="weekly"
                              checked={selectedSubscription === 'weekly'}
                              onChange={(e) => setSelectedSubscription(e.target.value)}
                              className="w-4 h-4 text-mocha"
                            />
                            <span className="text-charcoal">Weekly delivery (Save 10%)</span>
                          </label>
                          <label className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name="subscription"
                              value="monthly"
                              checked={selectedSubscription === 'monthly'}
                              onChange={(e) => setSelectedSubscription(e.target.value)}
                              className="w-4 h-4 text-mocha"
                            />
                            <span className="text-charcoal">Monthly delivery (Save 15%)</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Quantity */}
                    <div className="mb-6">
                      <h4 className="font-semibold text-mocha mb-3">Quantity</h4>
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="p-2 border border-soft-beige rounded-lg hover:bg-warm-white transition-colors"
                        >
                          <Minus className="w-4 h-4 text-charcoal" />
                        </button>
                        <span className="text-xl font-semibold text-charcoal min-w-[3ch] text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => setQuantity(quantity + 1)}
                          className="p-2 border border-soft-beige rounded-lg hover:bg-warm-white transition-colors"
                        >
                          <Plus className="w-4 h-4 text-charcoal" />
                        </button>
                      </div>
                    </div>

                    {/* Add to Cart Button */}
                    <button
                      onClick={handleAddToCart}
                      className="w-full bg-mocha hover:bg-charcoal text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-[1.02] shadow-md hover:shadow-lg"
                    >
                      Add to Cart • {formatPrice(product.regional_price * quantity)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { ProductModal };