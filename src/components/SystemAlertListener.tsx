import React, { useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { notify } from './NeonNotification';
import playSound from '../lib/sounds';

export function SystemAlertListener() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Listen for GLOBAL alerts, targeted USER alerts, or targeted GROUP alerts
    const q = query(
      collection(db, 'system_alerts'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const alert = change.doc.data();
          const isTargeted = 
            alert.targetType === 'GLOBAL' || 
            (alert.targetType === 'USER' && alert.targetId === user.uid) ||
            (alert.targetType === 'GROUP' && user.groupIds?.includes(alert.targetId));

          const alreadyRead = alert.readBy?.includes(user.uid);

          if (isTargeted && !alreadyRead) {
            // Show notification
            notify(alert.message, 'warning');
            playSound.notification();

            // DO NOT update the global alert document with readBy here
            // This causes a chain reaction where every user's update triggers a new snapshot for everyone
            // impacting quota quadratically.
          }
        }
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'system_alerts'));

    return () => unsub();
  }, [user]);

  return null;
}
