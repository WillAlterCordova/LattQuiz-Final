import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';
// Importamos el cliente de supabase (asegúrate de que la ruta sea correcta)
import { supabase } from '../lib/supabase'; 

export function SystemAlertListener() {
  const { user } = useAuthStore();

  useEffect(() => {
    // Solo activamos la escucha si hay un usuario autenticado
    if (!user) return;

    // 1. Configuración del canal de tiempo real
    const channel = supabase
      .channel('system_alerts_changes') // Nombre del canal
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Escuchamos solo nuevas alertas
          schema: 'public',
          table: 'system_alerts',
        },
        (payload) => {
          const newAlert = payload.new;

          // 2. Lógica de filtrado (Targeting)
          // Verificamos si la alerta es Global, para este usuario específico o su grupo
          const isTargeted = 
            newAlert.target_type === 'GLOBAL' || 
            (newAlert.target_type === 'USER' && newAlert.target_id === user.id) ||
            (newAlert.target_type === 'GROUP' && user.groupIds?.includes(newAlert.target_id));

          if (isTargeted) {
            // 3. Mostrar notificación y sonido
            notify(newAlert.message, 'warning');
            playSound.notification();
          }
        }
      )
      .subscribe();

    // 4. Limpieza al desmontar el componente
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
  return null;
}
