import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "./button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu";
import { Menu, X, Search, ShoppingCart, User } from "lucide-react";
import { useAuth } from "../../App";
import { useShopping } from "../../App";
import { API } from "../../App";

const FlintFloursHeader = () => {
  const { user, logout } = useAuth();
  const { region, setRegion, getCartTotal } = useShopping();
  const navigate = useNavigate();
  const [isOpen, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Search functionality with autocomplete
  const searchProducts = async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const response = await axios.get(`${API}/products?region=${region}&search=${encodeURIComponent(query)}`);
      const results = response.data.slice(0, 5); // Limit to 5 suggestions
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchProducts(query);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setShowSearchResults(false);
    }
  };

  const handleSearchResultClick = (product) => {
    navigate(`/products/${product.id}`);
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const handleSearchBlur = () => {
    // Delay to allow click on search results
    setTimeout(() => setShowSearchResults(false), 200);
  };

  const navigationItems = [
    {
      title: "Home",
      href: "/",
      description: "",
    },
    {
      title: "Our Collection",
      href: "/products",
      description: "Artisan breads, cookies, cakes and snacks",
    },
    {
      title: "Account",
      description: "Manage your orders and preferences",
      items: user ? [
        {
          title: "My Orders",
          href: "/my-orders",
        },
        {
          title: "My Subscriptions", 
          href: "/my-subscriptions",
        },
        {
          title: "Profile",
          href: "/profile",
        },
        ...(user.is_admin ? [{
          title: "Admin Panel",
          href: "/admin",
        }] : [])
      ] : [
        {
          title: "Login",
          href: "/login",
        },
        {
          title: "Register",
          href: "/register",
        }
      ],
    },
  ];

  return (
    <header className="w-full z-40 fixed top-0 left-0 bg-white/95 backdrop-blur-sm border-b border-soft-beige shadow-sm">
      <div className="container relative mx-auto min-h-20 flex gap-4 flex-row lg:grid lg:grid-cols-3 items-center px-4">
        {/* Left Navigation */}
        <div className="justify-start items-center gap-4 lg:flex hidden flex-row">
          <NavigationMenu className="flex justify-start items-start">
            <NavigationMenuList className="flex justify-start gap-4 flex-row">
              {navigationItems.map((item) => (
                <NavigationMenuItem key={item.title}>
                  {item.href ? (
                    <NavigationMenuLink asChild>
                      <Link to={item.href}>
                        <Button variant="ghost" className="text-charcoal hover:text-mocha">
                          {item.title}
                        </Button>
                      </Link>
                    </NavigationMenuLink>
                  ) : (
                    <>
                      <NavigationMenuTrigger className="font-medium text-sm text-charcoal hover:text-mocha">
                        {item.title}
                      </NavigationMenuTrigger>
                      <NavigationMenuContent className="!w-[400px] p-4 bg-white border border-soft-beige">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col">
                            <p className="text-base font-semibold text-mocha">{item.title}</p>
                            <p className="text-soft-gray text-sm">
                              {item.description}
                            </p>
                          </div>
                          <div className="flex flex-col text-sm">
                            {item.items?.map((subItem) => (
                              <NavigationMenuLink
                                key={subItem.title}
                                asChild
                                className="flex flex-row justify-between items-center hover:bg-warm-white py-2 px-4 rounded transition-colors"
                              >
                                <Link to={subItem.href} className="text-charcoal hover:text-mocha">
                                  <span>{subItem.title}</span>
                                </Link>
                              </NavigationMenuLink>
                            ))}
                          </div>
                        </div>
                      </NavigationMenuContent>
                    </>
                  )}
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Center Logo & Search */}
        <div className="flex lg:justify-center items-center gap-4">
          <Link to="/" className="font-serif text-2xl font-bold text-mocha">
            Flint & Flours
          </Link>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center">
            <div className="relative">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 border border-soft-beige rounded-lg focus:outline-none focus:ring-2 focus:ring-mocha focus:border-transparent"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-soft-gray w-4 h-4" />
            </div>
          </form>
        </div>

        {/* Right Actions */}
        <div className="flex justify-end w-full gap-4 items-center">
          {/* Region Selector */}
          <select 
            value={region} 
            onChange={(e) => setRegion(e.target.value)}
            className="hidden md:block px-3 py-2 border border-soft-beige rounded-lg bg-white text-charcoal focus:outline-none focus:ring-2 focus:ring-mocha"
          >
            <option value="India">🇮🇳 India</option>
            <option value="Canada">🇨🇦 Canada</option>
          </select>

          {/* Cart */}
          <Link to="/cart">
            <Button variant="ghost" className="relative text-charcoal hover:text-mocha">
              <ShoppingCart className="w-5 h-5" />
              {getCartTotal() > 0 && (
                <span className="absolute -top-2 -right-2 bg-dusty-rose text-charcoal text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {getCartTotal()}
                </span>
              )}
            </Button>
          </Link>

          {/* User Menu */}
          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-sm text-soft-gray">
                {user.email.split('@')[0]}
                {user.is_email_verified ? ' ✅' : ' ⚠️'}
              </span>
              <Button 
                onClick={handleLogout} 
                variant="outline"
                className="border-dusty-rose text-charcoal hover:bg-dusty-rose"
              >
                Logout
              </Button>
            </div>
          ) : (
            <div className="hidden md:flex gap-2">
              <Link to="/login">
                <Button variant="ghost" className="text-charcoal hover:text-mocha">Login</Button>
              </Link>
              <Link to="/register">
                <Button className="bg-mocha hover:bg-charcoal text-white">Register</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex w-12 shrink lg:hidden items-end justify-end">
          <Button variant="ghost" onClick={() => setOpen(!isOpen)}>
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          {isOpen && (
            <div className="absolute top-20 border-t flex flex-col w-full right-0 bg-white shadow-lg py-4 container gap-8">
              {/* Mobile Search */}
              <form onSubmit={handleSearch} className="px-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-soft-beige rounded-lg focus:outline-none focus:ring-2 focus:ring-mocha"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-soft-gray w-4 h-4" />
                </div>
              </form>

              {/* Mobile Region Selector */}
              <div className="px-4">
                <select 
                  value={region} 
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 border border-soft-beige rounded-lg bg-white text-charcoal"
                >
                  <option value="India">🇮🇳 India</option>
                  <option value="Canada">🇨🇦 Canada</option>
                </select>
              </div>

              {/* Mobile Navigation */}
              {navigationItems.map((item) => (
                <div key={item.title} className="px-4">
                  <div className="flex flex-col gap-2">
                    {item.href ? (
                      <Link
                        to={item.href}
                        className="flex justify-between items-center py-2 text-charcoal hover:text-mocha"
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-lg">{item.title}</span>
                      </Link>
                    ) : (
                      <p className="text-lg text-mocha font-semibold">{item.title}</p>
                    )}
                    {item.items &&
                      item.items.map((subItem) => (
                        <Link
                          key={subItem.title}
                          to={subItem.href}
                          className="flex justify-between items-center py-1 pl-4 text-soft-gray hover:text-mocha"
                          onClick={() => setOpen(false)}
                        >
                          <span>{subItem.title}</span>
                        </Link>
                      ))}
                  </div>
                </div>
              ))}

              {/* Mobile User Actions */}
              {user ? (
                <div className="px-4 pt-4 border-t border-soft-beige">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-soft-gray">
                      {user.email.split('@')[0]} {user.is_email_verified ? '✅' : '⚠️'}
                    </span>
                    <Button 
                      onClick={() => { handleLogout(); setOpen(false); }} 
                      variant="outline"
                      className="w-full border-dusty-rose text-charcoal hover:bg-dusty-rose"
                    >
                      Logout
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 pt-4 border-t border-soft-beige flex gap-2">
                  <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                    <Button variant="ghost" className="w-full text-charcoal hover:text-mocha">Login</Button>
                  </Link>
                  <Link to="/register" className="flex-1" onClick={() => setOpen(false)}>
                    <Button className="w-full bg-mocha hover:bg-charcoal text-white">Register</Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export { FlintFloursHeader };