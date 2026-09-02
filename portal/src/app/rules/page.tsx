'use client';

import { useState } from 'react';
import AccessListsPage from '../access-lists/page';
import FiltersPage from '../filters/page';
import AttachmentPolicyPage from '../attachment-policy/page';

const tabs = [
  { id: 'access', label: 'Whitelist & Blocklist' },
  { id: 'filters', label: 'Filter Rules' },
  { id: 'attachment', label: 'Attachment Policy' },
];

export default function RulesPage() {
  const [tab, setTab] = useState('access');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Mail Rules</h2>
        <p className="text-sm text-gray-500">Whitelist/blocklist, content filters, and attachment policy in one place</p>
      </div>
      <div className="border-b border-gray-200 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'border-b-2 border-primary-600 text-primary-600 pb-2 px-3 text-sm font-medium'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 pb-2 px-3 text-sm'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'access' && <AccessListsPage />}
      {tab === 'filters' && <FiltersPage />}
      {tab === 'attachment' && <AttachmentPolicyPage />}
    </div>
  );
}
