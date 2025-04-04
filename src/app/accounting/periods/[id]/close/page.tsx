'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { verifyPeriodReadyForClosing, generateClosingEntries } from '@/services/closingService';

interface ClosingPageProps {
  params: {
    id: string;
  };
}

export default function ClosingPage({ params }: ClosingPageProps) {
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState<string>('');

  const handleClosePeriod = async () => {
    if (!user?.id) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debe iniciar sesión para realizar esta acción.'
      });
      return;
    }

    setIsLoading(true);

    try {
      // Verificar si está listo para cierre
      const verificationResult = await verifyPeriodReadyForClosing(params.id);
      
      if (!verificationResult.ready) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: verificationResult.message
        });
        return;
      }

      // Generar asientos de cierre
      const result = await generateClosingEntries(
        params.id,
        user.id,
        selectedDate,
        notes
      );

      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.message
        });

        // Redirigir a la lista de asientos
        router.push(`/accounting/entries?period=${params.id}`);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error al procesar el cierre del período.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Cierre de Período</CardTitle>
          <CardDescription>
            Seleccione la fecha para generar los asientos de cierre
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha de los Asientos</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                  disabled={isLoading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, 'PPP', { locale: es })
                  ) : (
                    <span>Seleccione una fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notas (Opcional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ingrese notas adicionales para los asientos de cierre"
              disabled={isLoading}
            />
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleClosePeriod}
              disabled={isLoading}
            >
              {isLoading ? 'Procesando...' : 'Cerrar Período'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 