'use client';

import { useEffect } from 'react';

export type DashboardDebugPayload = {
  serviceRoleUsed: boolean;
  allTermsLength: number;
  myTermsLength: number;
  otherTermsLength: number;
  instructorId: string;
  termsSummary: Array<{
    id: string;
    instructor_id: string;
    date: string;
    slot_index: number;
    instructor_name: string | null;
    predavanja_count: number;
  }>;
};

export default function DashboardDebugLog({ payload }: { payload: DashboardDebugPayload }) {
  useEffect(() => {
    console.log('[dashboard BROWSER] serviceRoleUsed:', payload.serviceRoleUsed);
    console.log('[dashboard BROWSER] allTerms.length:', payload.allTermsLength);
    console.log('[dashboard BROWSER] myTerms.length:', payload.myTermsLength, '| otherTerms.length:', payload.otherTermsLength, '| instructorId:', payload.instructorId);
    console.log('[dashboard BROWSER] allTerms summary:', payload.termsSummary);
  }, [payload]);
  return null;
}
