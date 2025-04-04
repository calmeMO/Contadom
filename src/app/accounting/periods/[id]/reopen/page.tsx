'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { AccountingPeriod } from '@/types/accounting';
import { verifyReadyForReopening, generateOpeningEntries, getTargetPeriodsForReopening } from '@/services/reopeningService';

interface ReopeningPageProps {
  params: {
    id: string;
  };
}

export default function ReopeningPage({ params }: ReopeningPageProps) {
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [targetPeriods, setTargetPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    loadTargetPeriods();
  }, []);

  const loadTargetPeriods = async () => {
    try {
      const periods = await getTargetPeriodsForReopening(params.id);
      setTargetPeriods(periods);
      if (periods.length > 0) {
        setSelectedPeriodId(periods[0].id);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los períodos disponibles para reapertura.'
      });
    }
  };

  const handleReopenPeriod = async () => {
    if (!user?.id || !selectedPeriodId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Faltan datos requeridos para la reapertura.'
      });
      return;
    }

    setIsLoading(true);

    try {
      // Verificar si está listo para reapertura
      const verificationResult = await verifyReadyForReopening(params.id, selectedPeriodId);
      
      if (!verificationResult.ready) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: verificationResult.message
        });
        return;
      }

      // Generar asientos de apertura
      const result = await generateOpeningEntries(
        params.id,
        selectedPeriodId,
        user.id,
        selectedDate,
        notes
      );

      if (result.success) {
        toast({
          title: 'Éxito',
          description: result.message
        });

        // Redirigir al asiento de apertura
        router.push(`/accounting/entries/${result.openingEntryId}`);
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
        description: 'Ocurrió un error al procesar la reapertura.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Reapertura de Período</CardTitle>
          <CardDescription>
            Seleccione el período destino y la fecha para generar el asiento de apertura
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Período Destino</label>
            <Select
              value={selectedPeriodId}
              onValueChange={setSelectedPeriodId}
              disabled={isLoading || targetPeriods.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un período" />
              </SelectTrigger>
              <SelectContent>
                {targetPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {period.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha del Asiento</label>
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
              placeholder="Ingrese notas adicionales para el asiento de apertura"
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
              onClick={handleReopenPeriod}
              disabled={isLoading || !selectedPeriodId}
            >
              {isLoading ? 'Procesando...' : 'Reabrir Período'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 