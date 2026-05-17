'use client';

import { useState, useEffect } from 'react';

export function useWindowScale(baseWidth = 1200, baseHeight = 600) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      // Available width with a 10% margin on the sides (90% width budget)
      const availWidth = window.innerWidth * 0.92;
      // Available height subtracting header space (82% height budget)
      const availHeight = window.innerHeight * 0.82;

      // Calculate perfect scale factor to fit both width and height
      const scaleX = availWidth / baseWidth;
      const scaleY = availHeight / baseHeight;

      // Use the smaller scale factor, capped at a maximum of 1
      setScale(Math.min(scaleX, scaleY, 1));
    };

    window.addEventListener('resize', handleResize);
    // Execute immediately on mount
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [baseWidth, baseHeight]);

  return scale;
}
