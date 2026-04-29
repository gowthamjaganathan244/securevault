"use client";

import React, { useEffect, useState } from "react";
import { motion, useSpring, useMotionValue } from "framer-motion";

export function SecureCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // High-performance spring for the core dot (near 1:1 follow)
  const dotConfig = { damping: 20, stiffness: 800, mass: 0.5 };
  const dotX = useSpring(mouseX, dotConfig);
  const dotY = useSpring(mouseY, dotConfig);

  // Fluid spring for the outer ring (slight premium lag)
  const ringConfig = { damping: 25, stiffness: 200, mass: 1 };
  const ringX = useSpring(mouseX, ringConfig);
  const ringY = useSpring(mouseY, ringConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);

      if (!isVisible) setIsVisible(true);

      const target = e.target as HTMLElement;
      // Detect if hovered element is interactive
      const isClickable =
        target.closest('button') ||
        target.closest('a') ||
        target.closest('.secure-cursor-target') ||
        target.closest('.interactive-secure') ||
        window.getComputedStyle(target).cursor === 'pointer' ||
        target.hasAttribute('data-secure-cursor');

      setIsHovering(!!isClickable);
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", handleMouseMove);
    document.body.addEventListener("mouseleave", handleMouseLeave);
    document.body.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [mouseX, mouseY, isVisible]);

  // Disable on mobile/touch devices
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      setIsVisible(false);
    }
  }, []);

  return (
    <>
      {/* 1. Core Dot: High Stiffness (Perfect Follow) */}
      <motion.div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          x: dotX,
          y: dotY,
          pointerEvents: "none",
          zIndex: 10000,
          opacity: (isVisible && isHovering) ? 1 : 0,
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div 
          animate={{
            scale: isHovering ? 1.5 : 1,
            backgroundColor: "#ffffff",
            boxShadow: "0 0 15px rgba(255, 255, 255, 0.8)",
          }}
          className="w-1.5 h-1.5 rounded-full" 
        />
      </motion.div>

      {/* 2. Outer Ring: Lower Stiffness (Fluid Follow) */}
      <motion.div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          x: ringX,
          y: ringY,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: (isVisible && isHovering) ? 1 : 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          translateX: "-50%",
          translateY: "-50%",
        }}
      >
        <motion.div
          animate={{
            width: isHovering ? 32 : 16,
            height: isHovering ? 32 : 16,
            borderColor: "rgba(255, 255, 255, 0.6)",
            borderWidth: 1.5,
            rotate: isHovering ? 90 : 0,
          }}
          transition={{ type: "spring", stiffness: 250, damping: 25 }}
          className="rounded-full border border-solid flex items-center justify-center relative"
          style={{
            boxShadow: "0 0 20px rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Scanner Crosshairs */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute top-0 w-[1px] h-1 bg-white/40" />
            <div className="absolute bottom-0 w-[1px] h-1 bg-white/40" />
            <div className="absolute left-0 h-[1px] w-1 bg-white/40" />
            <div className="absolute right-0 h-[1px] w-1 bg-white/40" />
          </div>

          {/* Corner Brackets on Hover */}
          {isHovering && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-[-3px] flex items-center justify-center pointer-events-none"
            >
              <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t-2 border-l-2 border-white/80" />
              <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-2 border-r-2 border-white/80" />
              <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-2 border-l-2 border-white/80" />
              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b-2 border-r-2 border-white/80" />
            </motion.div>
          )}
        </motion.div>
        
        {/* Outer Pulse Glow */}
        <motion.div
          animate={{
            scale: isHovering ? [1, 1.4, 1] : 1,
            opacity: isHovering ? [0.05, 0.15, 0.05] : 0,
          }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute w-10 h-10 rounded-full bg-white"
        />
      </motion.div>
    </>
  );
}
