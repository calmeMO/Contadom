import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  isOpen?: boolean;
}

export default function Modal({ title, children, onClose, size = 'md', isOpen = true }: ModalProps) {
  // Si el modal no está abierto, no renderizamos nada
  if (!isOpen) return null;
  
  // Manejar la tecla ESC para cerrar el modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    
    // Prevenir scroll en el body
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  // Determinar el ancho del modal según el tamaño
  const getWidthClass = () => {
    switch (size) {
      case 'sm':
        return 'max-w-md';
      case 'md':
        return 'max-w-lg';
      case 'lg':
        return 'max-w-2xl';
      case 'xl':
        return 'max-w-6xl';
      case 'full':
        return 'max-w-full mx-4';
      default:
        return 'max-w-lg';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Fondo oscuro */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Contenedor centrado */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal */}
        <div 
          className={`relative bg-white rounded-lg shadow-xl w-full ${getWidthClass()} transform transition-all`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 
              id="modal-title" 
              className="text-lg font-medium text-gray-900"
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Contenido */}
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
} 