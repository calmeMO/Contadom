import React from 'react';
import { cn } from '../../lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div
          className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
          onClick={onClose}
        />
        <div
          className={cn(
            'relative transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all',
            'sm:my-8 sm:w-full sm:max-w-lg',
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
} 