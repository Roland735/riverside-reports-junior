"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  FiMenu,
  FiX,
  FiLogOut,
  FiHome,
  FiUserPlus,
  FiUsers,
  FiCalendar,
  FiClipboard,
  FiBookOpen,
  FiFileText,
  FiChevronRight,
  FiChevronLeft,
} from "react-icons/fi";

const icons = {
  FiHome,
  FiUserPlus,
  FiUsers,
  FiCalendar,
  FiClipboard,
  FiBookOpen,
  FiFileText,
};

export default function DashboardLayout({ children, links, title }) {
  const [open, setOpen] = useState(false);
  const [activeLink, setActiveLink] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef(null);
  const { data: session } = useSession();

  useEffect(() => {
    setActiveLink(window.location.pathname);
  }, []);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        open &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col transform
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:static md:inset-0
          transition-all duration-300 ease-in-out
          bg-slate-800 border-r border-red-500/30 shadow-2xl
          ${sidebarCollapsed ? "md:w-20" : "md:w-64"}
        `}
      >
        {/* Logo */}
        <div
          className={`p-5 bg-gradient-to-r from-red-600 to-red-800 border-b border-red-400 ${
            sidebarCollapsed ? "text-center" : ""
          }`}
        >
          {sidebarCollapsed ? (
            <div className="text-2xl font-bold">R</div>
          ) : (
            <>
              <div className="text-xl font-bold tracking-tight">
                RIVERSIDE PORTAL
              </div>
              <div className="text-xs text-red-200 font-light mt-1">
                Navigation
              </div>
            </>
          )}
        </div>

        {/* Links */}
        <nav
          className={`flex-1 p-3 mt-2 space-y-1 overflow-y-auto sidebar-scrollbar ${
            sidebarCollapsed ? "px-0" : "px-1"
          }`}
        >
          {links.map(({ href, label, iconName }) => {
            const Icon = icons[iconName] || FiHome;
            const isActive = activeLink === href;
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center rounded-lg transition-all duration-200 group
                  ${
                    isActive
                      ? "bg-red-600/90 text-white shadow-lg"
                      : "text-slate-300 hover:bg-red-500/20 hover:text-white"
                  }
                  ${
                    sidebarCollapsed
                      ? "justify-center px-3 py-4 mx-1"
                      : "px-4 py-3 mx-2"
                  }
                `}
                onClick={() => {
                  setActiveLink(href);
                  setOpen(false);
                }}
                title={sidebarCollapsed ? label : ""}
              >
                <Icon
                  className={`${isActive ? "text-white" : "text-red-400"} ${
                    sidebarCollapsed ? "text-xl" : "mr-3"
                  }`}
                />
                {!sidebarCollapsed && (
                  <>
                    <span className="font-medium text-sm">{label}</span>
                    <FiChevronRight
                      className={`ml-auto text-sm opacity-0 group-hover:opacity-100 ${
                        isActive && "opacity-100"
                      }`}
                    />
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle & Profile */}
        <div className="border-t border-red-500/20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-full p-4 text-red-300 hover:text-white hover:bg-red-500/10 transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <FiChevronRight size={20} />
            ) : (
              <FiChevronLeft size={20} />
            )}
            {!sidebarCollapsed && (
              <span className="ml-2 text-xs">Collapse</span>
            )}
          </button>

          <div
            className={`p-4 ${
              sidebarCollapsed ? "text-center" : "flex items-center"
            }`}
          >
            <div
              className="bg-red-500 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              title={sidebarCollapsed ? session?.user?.name : ""}
            >
              {session?.user?.name?.charAt(0) || "U"}
            </div>
            {!sidebarCollapsed && (
              <div className="ml-3">
                <div className="text-sm font-medium truncate max-w-[140px]">
                  {session?.user?.name || "User"}
                </div>
                <div className="text-xs text-red-300 truncate max-w-[140px]">
                  {session?.user?.email || "user@example.com"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header (full width) */}
        <header className="flex items-center justify-between bg-slate-800/80 backdrop-blur-md px-6 py-3 border-b border-red-500/30 shadow-lg">
          <div className="flex items-center">
            <button
              className="md:hidden p-2 mr-3 rounded-lg hover:bg-red-500/20 transition-colors"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <FiX size={24} className="text-red-400" />
              ) : (
                <FiMenu size={24} className="text-red-400" />
              )}
            </button>
            <div className="flex items-center">
              <div className="w-2 h-8 bg-red-500 rounded-full mr-3" />
              <h1 className="text-xl font-bold tracking-wide">{title}</h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="font-medium">{session?.user?.name}</span>
              <span className="text-xs text-red-300">
                {session?.user?.role || "Administrator"}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 rounded-lg hover:bg-red-500/20 transition-colors group flex items-center"
            >
              <FiLogOut
                size={20}
                className="text-red-400 group-hover:text-white"
              />
              <span className="ml-2 hidden lg:inline text-sm">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content (padded under sidebar) */}
        <main
          className={`flex-1 overflow-auto p-6 bg-gradient-to-b from-slate-900/30 to-slate-800/30 ${
            sidebarCollapsed ? "md:pl-5" : "md:pl-10"
          }`}
        >
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        <footer className="py-3 px-6 text-center text-xs text-slate-400 border-t border-red-500/20 bg-slate-800/50">
          © {new Date().getFullYear()} Riverside Portal. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
