'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Copy, RefreshCw, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const tabs = ['Profile', 'Password', 'API Key', 'Notifications'];

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('Profile');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [notifications, setNotifications] = useState({
    spamAlerts: true,
    dailyDigest: false,
    domainIssues: true,
    securityAlerts: true,
  });

  const apiKey = 'cmp_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';

  const handleSaveProfile = () => {
    toast.success('Profile updated');
  };

  const handleSavePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    toast.success('Password updated');
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success('API key copied to clipboard');
  };

  const regenerateKey = () => {
    toast.success('API key regenerated');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your account and preferences</p>
        </div>
        <Link href="/settings/branding">
          <Button variant="outline">Branding Settings</Button>
        </Link>
      </div>

      <div className="flex gap-6">
        {/* Tab nav */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab: any) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${activeTab === tab ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'Profile' && (
            <Card>
              <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input label="Role" value={(user as any)?.role || 'User'} disabled />
                <Button onClick={handleSaveProfile}>Save Changes</Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'Password' && (
            <Card>
              <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Input label="Current Password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : undefined} />
                <Button onClick={handleSavePassword} disabled={!oldPassword || !newPassword || newPassword !== confirmPassword}>
                  Update Password
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'API Key' && (
            <Card>
              <CardHeader><CardTitle>API Key</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">Use this API key to authenticate with the CMP Gateway API.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm">
                    {showApiKey ? apiKey : apiKey.slice(0, 12) + '••••••••••••••••••••••••'}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={copyApiKey}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button variant="outline" onClick={regenerateKey}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate Key
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'Notifications' && (
            <Card>
              <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                      </p>
                      <p className="text-xs text-gray-500">
                        {key === 'spamAlerts' && 'Get notified when spam volume spikes'}
                        {key === 'dailyDigest' && 'Receive a daily summary of mail activity'}
                        {key === 'domainIssues' && 'Alerts for DNS or verification issues'}
                        {key === 'securityAlerts' && 'Important security notifications'}
                      </p>
                    </div>
                    <button
                      onClick={() => setNotifications({ ...notifications, [key]: !value })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
                <Button onClick={() => toast.success('Notification preferences saved')}>
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
