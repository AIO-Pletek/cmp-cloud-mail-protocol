'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  Shield, Server, Lock, Key, Gauge, Bell, Globe, AlertTriangle,
  CheckCircle, XCircle, Loader2, Plus, Trash2, Copy, Eye, EyeOff,
  Settings, FileText, Zap, ShieldCheck, ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function GatewayPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [addHostOpen, setAddHostOpen] = useState(false);
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');

  const [hostForm, setHostForm] = useState({
    address: '', label: '', authType: 'ip', username: '', password: ''
  });

  const [keyForm, setKeyForm] = useState({
    label: '', allowedIps: '', expiresDays: 365
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['gateway-config'],
    queryFn: () => cmpApi.gateway.config(),
  });

  const { data: hostsData } = useQuery({
    queryKey: ['gateway-hosts'],
    queryFn: () => cmpApi.gateway.trustedHosts(),
  });

  const { data: keysData } = useQuery({
    queryKey: ['gateway-api-keys'],
    queryFn: () => cmpApi.gateway.apiKeys(),
  });

  const addHostMutation = useMutation({
    mutationFn: (data: any) => cmpApi.gateway.addTrustedHost(data),
    onSuccess: (data: any) => {
      toast.success(data.message);
      setAddHostOpen(false);
      setHostForm({ address: '', label: '', authType: 'ip', username: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['gateway-hosts'] });
    },
    onError: () => toast.error('Failed to add host'),
  });

  const removeHostMutation = useMutation({
    mutationFn: (address: string) => cmpApi.gateway.removeTrustedHost(address),
    onSuccess: () => {
      toast.success('Host removed');
      queryClient.invalidateQueries({ queryKey: ['gateway-hosts'] });
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: (data: any) => cmpApi.gateway.createApiKey(data),
    onSuccess: (data: any) => {
      setNewKeyValue(data.key);
      setShowNewKey(true);
      toast.success('API key created - save it now!');
      queryClient.invalidateQueries({ queryKey: ['gateway-api-keys'] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: string) => cmpApi.gateway.revokeApiKey(keyId),
    onSuccess: () => {
      toast.success('API key revoked');
      queryClient.invalidateQueries({ queryKey: ['gateway-api-keys'] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: any) => cmpApi.gateway.updateConfig(data),
    onSuccess: () => {
      toast.success('Configuration updated');
      queryClient.invalidateQueries({ queryKey: ['gateway-config'] });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'hosts', label: 'Trusted Hosts', icon: Server },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'notifications', label: 'Alerts', icon: Bell },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Enterprise Gateway</h2>
        <p className="text-sm text-gray-500 mt-1">Configure CMP as enterprise antispam gateway with multi-layer security</p>
      </div>

      {/* Architecture Diagram */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">Enterprise Antispam Gateway</p>
                <p className="text-xs text-blue-700">6-layer security: Connection → Verification → Filtering → Action → Delivery → Monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">Active</Badge>
              <Badge variant="info">{hostsData?.total || 0} hosts</Badge>
              <Badge variant="default">{keysData?.total || 0} API keys</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Security Layers */}
          <Card>
            <CardHeader>
              <CardTitle>Security Layers</CardTitle>
              <CardDescription>Multi-layer protection for all email traffic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { layer: 1, name: 'Connection', icon: Lock, desc: 'TLS 1.2+, SMTP AUTH, IP allowlist, rate limiting', status: config?.global?.requireTls },
                  { layer: 2, name: 'Verification', icon: ShieldCheck, desc: 'SPF, DKIM, DMARC, DNSBL, HELO validation', status: config?.verification?.checkSpf },
                  { layer: 3, name: 'Filtering', icon: Shield, desc: 'Rspamd spam filter, ClamAV virus scan, DLP', status: true },
                  { layer: 4, name: 'Action', icon: Zap, desc: 'Score-based: deliver, quarantine, or reject', status: true },
                  { layer: 5, name: 'Delivery', icon: Globe, desc: 'DKIM signing, TLS enforcement, queue management', status: true },
                  { layer: 6, name: 'Monitoring', icon: Bell, desc: 'Webhooks, audit log, real-time alerts', status: config?.notifications?.webhookUrl ? true : false },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.layer} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                        {item.layer}
                      </div>
                      <Icon className="w-5 h-5 text-gray-500" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                      <Badge variant={item.status ? 'success' : 'outline'}>
                        {item.status ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Flow */}
          <Card>
            <CardHeader><CardTitle>Mail Flow</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
                <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                  <Server className="w-4 h-4" /> Origin Server
                </div>
                <span className="text-gray-400">→ TLS+AUTH →</span>
                <div className="flex items-center gap-2 bg-blue-100 px-3 py-2 rounded-lg border border-blue-300">
                  <Shield className="w-4 h-4 text-blue-600" /> CMP Gateway
                </div>
                <span className="text-gray-400">→ Filter →</span>
                <div className="flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg border border-green-300">
                  <CheckCircle className="w-4 h-4 text-green-600" /> Deliver
                </div>
                <span className="text-gray-400">or</span>
                <div className="flex items-center gap-2 bg-red-100 px-3 py-2 rounded-lg border border-red-300">
                  <XCircle className="w-4 h-4 text-red-600" /> Reject
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{config?.global?.requireTls ? 'ON' : 'OFF'}</p><p className="text-xs text-gray-500">TLS Required</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{config?.rateLimits?.perIpPerHour || 1000}</p><p className="text-xs text-gray-500">Rate Limit/Hour</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">{config?.filtering?.spamThresholdQuarantine || 6.0}</p><p className="text-xs text-gray-500">Spam Threshold</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{config?.verification?.dnsblServers?.length || 0}</p><p className="text-xs text-gray-500">DNSBL Servers</p></CardContent></Card>
          </div>
        </div>
      )}

      {activeTab === 'hosts' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddHostOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Trusted Host</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {hostsData?.items?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left p-3">Address</th>
                    <th className="text-left p-3">Label</th>
                    <th className="text-left p-3">Auth</th>
                    <th className="text-left p-3">TLS</th>
                    <th className="text-left p-3">Rate Limit</th>
                    <th className="text-right p-3">Actions</th>
                  </tr></thead>
                  <tbody>
                    {hostsData.items.map((h: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="p-3 font-mono">{h.address}</td>
                        <td className="p-3">{h.label}</td>
                        <td className="p-3"><Badge variant="info">{h.authType}</Badge></td>
                        <td className="p-3"><Badge variant={h.tlsRequired ? 'success' : 'warning'}>{h.tlsRequired ? 'Required' : 'Optional'}</Badge></td>
                        <td className="p-3">{h.rateLimit}/hr</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeHostMutation.mutate(h.address)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No trusted hosts. Add your mail server IP.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Connection Security</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm">Require TLS</p><p className="text-xs text-gray-500">All connections must use TLS 1.2+</p></div>
                <Switch checked={config?.global?.requireTls} onCheckedChange={(v) => updateConfigMutation.mutate({...config, global: {...config?.global, requireTls: v}})} />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm">Require Authentication</p><p className="text-xs text-gray-500">Reject unauthenticated relay attempts</p></div>
                <Switch checked={config?.global?.requireAuth} onCheckedChange={(v) => updateConfigMutation.mutate({...config, global: {...config?.global, requireAuth: v}})} />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm">Check DNSBL</p><p className="text-xs text-gray-500">Check sender IP against DNS blacklists</p></div>
                <Switch checked={config?.verification?.checkDnsbl} onCheckedChange={(v) => updateConfigMutation.mutate({...config, verification: {...config?.verification, checkDnsbl: v}})} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Spam Thresholds</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div><p className="text-xs text-gray-500 mb-1">Add Header</p><p className="text-2xl font-bold text-yellow-600">{config?.filtering?.spamThresholdAddHeader}</p></div>
                <div><p className="text-xs text-gray-500 mb-1">Quarantine</p><p className="text-2xl font-bold text-orange-600">{config?.filtering?.spamThresholdQuarantine}</p></div>
                <div><p className="text-xs text-gray-500 mb-1">Reject</p><p className="text-2xl font-bold text-red-600">{config?.filtering?.spamThresholdReject}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">API keys for programmatic relay authentication</p>
            <Button onClick={() => setAddKeyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create API Key</Button>
          </div>

          {showNewKey && (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-green-900">API Key Created - Save It Now!</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-3 rounded border font-mono text-sm">
                  <code className="flex-1 break-all">{newKeyValue}</code>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(newKeyValue)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-green-700 mt-2">This key will not be shown again. Store it securely.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowNewKey(false)}>Dismiss</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {keysData?.items?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left p-3">Label</th>
                    <th className="text-left p-3">Key</th>
                    <th className="text-left p-3">Usage</th>
                    <th className="text-left p-3">Last Used</th>
                    <th className="text-right p-3">Actions</th>
                  </tr></thead>
                  <tbody>
                    {keysData.items.map((k: any) => (
                      <tr key={k.id} className="border-b">
                        <td className="p-3 font-medium">{k.label}</td>
                        <td className="p-3 font-mono text-xs">{k.keyPreview}</td>
                        <td className="p-3">{k.usageCount} times</td>
                        <td className="p-3 text-gray-500">{k.lastUsed || 'Never'}</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => revokeKeyMutation.mutate(k.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No API keys. Create one for SMTP AUTH relay.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader><CardTitle>Alert Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: 'notifyOnVirus', label: 'Virus Detected', desc: 'Alert when virus found in email' },
              { key: 'notifyOnHighSpam', label: 'High Spam Score', desc: 'Alert on spam score > reject threshold' },
              { key: 'notifyOnDlp', label: 'DLP Match', desc: 'Alert on data loss prevention trigger' },
              { key: 'notifyOnAuthFailure', label: 'Auth Failure', desc: 'Alert on failed relay authentication' },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
                <Switch
                  checked={config?.notifications?.[item.key]}
                  onCheckedChange={(v) => updateConfigMutation.mutate({
                    ...config, notifications: { ...config?.notifications, [item.key]: v }
                  })}
                />
              </div>
            ))}
            <Input
              label="Webhook URL"
              placeholder="https://your-siem.example.com/webhook"
              value={config?.notifications?.webhookUrl || ''}
              onChange={(e) => updateConfigMutation.mutate({
                ...config, notifications: { ...config?.notifications, webhookUrl: e.target.value }
              })}
            />
            <Input
              label="Admin Email"
              placeholder="admin@example.com"
              value={config?.notifications?.adminEmail || ''}
              onChange={(e) => updateConfigMutation.mutate({
                ...config, notifications: { ...config?.notifications, adminEmail: e.target.value }
              })}
            />
          </CardContent>
        </Card>
      )}

      {/* Add Host Dialog */}
      <Dialog open={addHostOpen} onOpenChange={setAddHostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Trusted Relay Host</DialogTitle>
            <DialogDescription>Configure your origin mail server to relay through CMP</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Server IP / CIDR" placeholder="203.0.113.10" value={hostForm.address} onChange={(e) => setHostForm({...hostForm, address: e.target.value})} />
            <Input label="Label" placeholder="Mail Server Jakarta" value={hostForm.label} onChange={(e) => setHostForm({...hostForm, label: e.target.value})} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Authentication</label>
              <div className="flex gap-2">
                {[['ip', 'IP Only'], ['smtp_auth', 'SMTP AUTH'], ['api_key', 'API Key']].map(([val, label]) => (
                  <button key={val} onClick={() => setHostForm({...hostForm, authType: val})} className={`px-3 py-2 text-sm rounded-md border ${hostForm.authType === val ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-gray-200'}`}>{label}</button>
                ))}
              </div>
            </div>
            {hostForm.authType === 'smtp_auth' && (
              <><Input label="Username" value={hostForm.username} onChange={(e) => setHostForm({...hostForm, username: e.target.value})} /><Input label="Password" type="password" value={hostForm.password} onChange={(e) => setHostForm({...hostForm, password: e.target.value})} /></>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddHostOpen(false)}>Cancel</Button>
            <Button onClick={() => addHostMutation.mutate(hostForm)} disabled={!hostForm.address}>Add Host</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add API Key Dialog */}
      <Dialog open={addKeyOpen} onOpenChange={setAddKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Relay API Key</DialogTitle>
            <DialogDescription>Generate an API key for SMTP AUTH relay authentication</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input label="Label" placeholder="Production Server" value={keyForm.label} onChange={(e) => setKeyForm({...keyForm, label: e.target.value})} />
            <Input label="Allowed IPs (comma separated)" placeholder="203.0.113.10, 192.168.1.0/24" value={keyForm.allowedIps} onChange={(e) => setKeyForm({...keyForm, allowedIps: e.target.value})} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKeyOpen(false)}>Cancel</Button>
            <Button onClick={() => createKeyMutation.mutate({
              label: keyForm.label,
              allowed_ips: keyForm.allowedIps ? keyForm.allowedIps.split(',').map(s => s.trim()) : [],
              expires_days: keyForm.expiresDays
            })} disabled={!keyForm.label}>Create Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
