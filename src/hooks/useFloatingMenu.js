import { useEffect, useRef, useState } from 'react';

export function useFloatingMenu({
  open,
  onClose,
  closeOnOutsideClick = false,
  align = 'end',
}) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);
  const openedViaPointerRef = useRef(false);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const style = {
        position: 'fixed',
        top: rect.bottom + 4,
        zIndex: 1100,
        minWidth: '9rem',
      };

      if (align === 'end') {
        style.right = Math.max(8, window.innerWidth - rect.right);
        style.left = 'auto';
      } else {
        style.left = Math.max(8, rect.left);
        style.right = 'auto';
      }

      setPanelStyle(style);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open || !closeOnOutsideClick) return undefined;

    const handlePointerDown = (event) => {
      if (openedViaPointerRef.current) {
        openedViaPointerRef.current = false;
        return;
      }
      if (panelRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, closeOnOutsideClick, onClose]);

  const markOpenedViaPointer = () => {
    openedViaPointerRef.current = true;
    requestAnimationFrame(() => {
      openedViaPointerRef.current = false;
    });
  };

  return {
    triggerRef,
    panelRef,
    panelStyle,
    markOpenedViaPointer,
  };
}
