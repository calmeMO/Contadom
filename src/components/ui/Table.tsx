import React from 'react';
import { cn } from '../../lib/utils';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export function Table({ className, children, ...props }: TableProps) {
  return (
    <table
      className={cn(
        'min-w-full divide-y divide-gray-300',
        'border-collapse border-spacing-0',
        className
      )}
      {...props}
    >
      {children}
    </table>
  );
} 