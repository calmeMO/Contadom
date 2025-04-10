import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface WarningModalProps {
  title: string;
  message: string;
  onContinue: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export default function WarningModal({ 
  title, 
  message, 
  onContinue, 
  onCancel, 
  isOpen 
}: WarningModalProps) {
  // Si el modal no está abierto, no renderizamos nada
  if (!isOpen) return null;
  
  // Manejar la tecla ESC para cerrar el modal
  React.useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    
    // Prevenir scroll en el body
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
      
      // Restaurar el scroll
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  // Usar createPortal para renderizar el modal fuera de la jerarquía de componentes
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Fondo oscuro */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />
      
      {/* Contenedor centrado */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal */}
        <div 
          className="relative bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warning-modal-title"
        >
          {/* Cabecera */}
          <div className="flex items-start p-4 border-b border-gray-200 bg-yellow-50">
            <div className="flex-shrink-0 mr-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h3 
                id="warning-modal-title" 
                className="text-lg font-medium text-gray-900"
              >
                {title}
              </h3>
            </div>
          </div>
          
          {/* Contenido */}
          <div className="p-5">
            <div className="mt-2">
              <p className="text-sm text-gray-700">
                {message}
              </p>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-yellow-600 border border-transparent rounded-md shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
} 