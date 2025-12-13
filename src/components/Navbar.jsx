import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaMicrophoneAlt, FaBars, FaTimes } from "react-icons/fa";
import { MdDashboard, MdMonitor, MdSettings } from "react-icons/md";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Refresh the page when the browser back button is used, after navigating back.
  useEffect(() => {
    const handlePopState = () => {
      // Browser already moved to previous entry; force a reload to refresh that page.
      window.location.reload();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <FaMicrophoneAlt className="text-2xl text-blue-600" />
              <span className="text-xl font-bold text-gray-800">Talkypies</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center justify-end flex-1 space-x-4">
            <Link
              to="/start"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
              onClick={(e) => {
                // Always navigate to /start with a full page load (not SPA navigation)
                e.preventDefault();
                try {
                  window.location.assign("/start");
                } catch (err) {
                  window.location.href = "/start";
                }
              }}
            >
              <MdDashboard className="text-xl" />
              <span>Parent Talkypie app</span>
            </Link>
            <Link
              to="/sessions"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
            >
              <MdMonitor className="text-xl" />
              <span>Monitor Sessions</span>
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
            >
              <MdSettings className="text-xl" />
              <span>Settings</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-gray-900"
            >
              {isMenuOpen ? (
                <FaTimes className="h-6 w-6" />
              ) : (
                <FaBars className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link
              to="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100"
              onClick={() => setIsMenuOpen(false)}
            >
              <MdSettings className="text-xl" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t md:hidden">
        <div className="grid grid-cols-2 gap-1">
          <Link
            to="/start"
            className="flex flex-col items-center justify-center py-2 text-gray-700 hover:bg-gray-100"
          >
            <MdDashboard className="text-xl" />
            <span className="text-xs">Start Talkypie</span>
          </Link>
          <Link
            to="/sessions"
            className="flex flex-col items-center justify-center py-2 text-gray-700 hover:bg-gray-100"
          >
            <MdMonitor className="text-xl" />
            <span className="text-xs">Monitor</span>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
