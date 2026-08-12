import { useCallback, useEffect } from 'react';

/**
 * A shared hook to toggle fullscreen mode via keyboard shortcuts ('f' or 'Enter')
 * and provide a function that can be bound to `onDoubleClick`.
 */
export function useFullscreenToggle() {
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Many standard TV remotes send 'Enter' when pressing the OK center button.
      // 'f' is a standard keyboard shortcut for fullscreen.
      if (e.key === 'Enter' || e.key.toLowerCase() === 'f') {
        toggleFullScreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullScreen]);

  return { toggleFullScreen };
}
