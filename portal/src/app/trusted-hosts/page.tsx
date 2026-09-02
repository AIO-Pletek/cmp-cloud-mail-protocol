'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrustedHostsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/enterprise?tab=origin-servers'); }, [router]);
  return null;
}
