/**
 * Da formato a un número como moneda
 * @param value El valor a formatear
 * @param decimals Número de decimales a mostrar (por defecto 2)
 * @returns Valor formateado como string
 */
export function formatCurrency(value: number | string | null, decimals: number = 2): string {
  if (value === null || value === undefined) return '0.00';
  
  // Convertir a número si es string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Verificar si es un número válido
  if (isNaN(numValue)) return '0.00';
  
  // Formatear con la cantidad especificada de decimales
  return numValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Da formato a una fecha como string en formato local
 * @param dateString String de fecha o objeto Date
 * @param options Opciones de formateo
 * @returns Fecha formateada como string
 */
export function formatDate(dateString: string | Date | null, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '';
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    
    // Opciones por defecto
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    return date.toLocaleDateString(undefined, options || defaultOptions);
  } catch (error) {
    console.error('Error al formatear fecha:', error);
    return '';
  }
}

/**
 * Formatea un número con separadores de miles y decimales
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('es-DO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Valida una fecha antes de formatearla para evitar errores
 * con fechas inválidas (ej. RangeError: Invalid time value)
 */
export function formatSafeDate(date: string | Date | null | undefined, format: string = 'dd/MM/yyyy'): string {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Verificar si es una fecha válida
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    // Siempre usar el formato español dd/MM/yyyy
    return dateObj.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return '';
  }
}

/**
 * Trunca un texto largo y añade puntos suspensivos
 * @param text El texto a truncar
 * @param length Longitud máxima (por defecto 50)
 * @returns Texto truncado
 */
export function truncateText(text: string, length: number = 50): string {
  if (!text) return '';
  if (text.length <= length) return text;
  
  return text.substring(0, length) + '...';
} 