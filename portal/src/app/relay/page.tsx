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
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  Send, Server, Shield, Plus, Trash2, TestTube, CheckCircle, XCircle,
  Loader2, Eye, EyeOff, Globe, AlertTriangle, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function RelayPage() {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    enabled: false,
    relayHost: '',
    relayPort: 587,
    relayUsername: '',
    relayPassword: '',
    relayTls: true,
  });

  // Domain relay form
  const [domainForm, setDomainForm] = useState({
    domain: '',
    relayHost: '',
    relayPort: 587,
    username: '',
    password: '',
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['relay-config'],
    queryFn: () => cmpApi.relay.config(),
  });

  const { data: logs } = useQuery({
    queryKey: ['relay-logs'],
    queryFn: () => cmpApi.relay.logs(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (config) {
      setForm({
        enabled: config.enabled || false,
        relayHost: config.relayHost || '',
        relayPort: config.relayPort || 587,
        relayUsername: config.relayUsername || '',
        relayPassword: '',
        relayTls: config.relayTls !== false,
      });
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => cmpApi.relay.update(data),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Relay config updated');
      queryClient.invalidateQueries({ queryKey: ['relay-config'] });
    },
    onError: () => toast.error('Failed to update relay config'),
  });

  const addDomainMutation = useMutation({
    mutationFn: (data: any) => cmpApi.relay.addDomain(data),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Domain relay added');
      setAddDomainOpen(false);
      setDomainForm({ domain: '', relayHost: '', relayPort: 587, username: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['relay-config'] });
    },
    onError: () => toast.error('Failed to add domain relay'),
  });

  const removeDomainMutation = useMutation({
    mutationFn: (domain: string) => cmpApi.relay.removeDomain(domain),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Domain relay removed');
      queryClient.invalidateQueries({ queryKey: ['relay-config'] });
    },
    onError: () => toast.error('Failed to remove domain relay'),
  });

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await cmpApi.relay.test({
        host: form.relayHost,
        port: form.relayPort,
        username: form.relayUsername,
        password: form.relayPassword,
      });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      enabled: form.enabled,
      relay_host: form.relayHost,
      relay_port: form.relayPort,
      relay_username: form.relayUsername,
      relay_password: form.relayPassword,
      relay_tls: form.relayTls,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Outgoing Mail Relay</h2>
        <p className="text-sm text-gray-500 mt-1">Configure SMTP relay for outgoing mail delivery</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${config?.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              <div>
                <p className="font-medium text-gray-900">
                  {config?.enabled ? 'Relay Active' : 'Direct Delivery'}
                </p>
                <p className="text-sm text-gray-500">
                  {config?.enabled
                    ? `Sending via ${config.relayHost}:${config.relayPort}`
                    : 'Sending directly from this server'}
                </p>
              </div>
            </div>
            <Badge variant={config?.enabled ? 'success' : 'outline'}>
              {config?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Relay Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              SMTP Relay Settings
            </CardTitle>
            <CardDescription>Configure external SMTP relay (SendGrid, Mailgun, SES, etc.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Enable SMTP Relay</p>
                <p className="text-xs text-gray-500">Route outgoing mail through external SMTP</p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>

            {form.enabled && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Input
                      label="SMTP Host"
                      placeholder="smtp.sendgrid.net"
                      value={form.relayHost}
                      onChange={(e) => setForm({ ...form, relayHost: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Port"
                    type="number"
                    value={form.relayPort}
                    onChange={(e) => setForm({ ...form, relayPort: parseInt(e.target.value) || 587 })}
                  />
                </div>

                <Input
                  label="Username"
                  placeholder="apikey"
                  value={form.relayUsername}
                  onChange={(e) => setForm({ ...form, relayUsername: e.target.value })}
                />

                <div className="relative">
                  <Input
                    label="Password / API Key"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={config?.relayPasswordSet ? '••••••••' : 'Enter password'}
                    value={form.relayPassword}
                    onChange={(e) => setForm({ ...form, relayPassword: e.target.value })}
                  />
                  <button
                    className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Require TLS</p>
                    <p className="text-xs text-gray-500">Encrypt connection to relay server</p>
                  </div>
                  <Switch
                    checked={form.relayTls}
                    onCheckedChange={(v) => setForm({ ...form, relayTls: v })}
                  />
                </div>

                {/* Test Connection */}
                {testResult && (
                  <div className={`p-3 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                      <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {testResult.message}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={testConnection} disabled={testing || !form.relayHost}>
                    {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <TestTube className="w-4 h-4 mr-1" />}
                    Test Connection
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Save Configuration
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Common Relay Presets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Popular Relay Providers
            </CardTitle>
            <CardDescription>Quick setup for common SMTP relay services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, desc: 'API key as password' },
                { name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, desc: 'postmaster@domain as username' },
                { name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, desc: 'IAM SMTP credentials' },
                { name: 'Postmark', host: 'smtp.postmarkapp.com', port: 587, desc: 'Server token as password' },
                { name: 'Brevo (Sendinblue)', host: 'smtp-relay.brevo.com', port: 587, desc: 'API key as password' },
                { name: 'Google Workspace', host: 'smtp.gmail.com', port: 587, desc: 'App password required' },
                { name: 'Microsoft 365', host: 'smtp.office365.com', port: 587, desc: 'Full email as username' },
              ].map((provider: any) => (
                <div key={provider.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{provider.name}</p>
                    <p className="text-xs text-gray-500">{provider.host}:{provider.port} — {provider.desc}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setForm({
                      ...form,
                      enabled: true,
                      relayHost: provider.host,
                      relayPort: provider.port,
                    });
                  }}>
                    Use
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Domain Relay */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Per-Domain Relay
              </CardTitle>
              <CardDescription>Route specific domains through different relay servers</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAddDomainOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Domain Relay
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {config?.domainRelays && config.domainRelays.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Relay Server</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.domainRelays.map((dr: any) => (
                  <TableRow key={dr.domain}>
                    <TableCell className="font-medium">{dr.domain}</TableCell>
                    <TableCell className="font-mono text-sm">{dr.relay}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeDomainMutation.mutate(dr.domain)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              No per-domain relays configured. All domains use the global relay setting.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Sending Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
              {logs.map((log: any, i: number) => (
                <p key={i} className="text-xs font-mono text-gray-300 leading-relaxed">
                  {log.line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No recent sending logs.</p>
          )}
        </CardContent>
      </Card>

      {/* Add Domain Relay Dialog */}
      <Dialog open={addDomainOpen} onOpenChange={setAddDomainOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Per-Domain Relay</DialogTitle>
            <DialogDescription>Route mail for a specific domain through a different SMTP server</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Domain"
              placeholder="example.com"
              value={domainForm.domain}
              onChange={(e) => setDomainForm({ ...domainForm, domain: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Input
                  label="SMTP Host"
                  placeholder="smtp.example.com"
                  value={domainForm.relayHost}
                  onChange={(e) => setDomainForm({ ...domainForm, relayHost: e.target.value })}
                />
              </div>
              <Input
                label="Port"
                type="number"
                value={domainForm.relayPort}
                onChange={(e) => setDomainForm({ ...domainForm, relayPort: parseInt(e.target.value) || 587 })}
              />
            </div>
            <Input
              label="Username (optional)"
              value={domainForm.username}
              onChange={(e) => setDomainForm({ ...domainForm, username: e.target.value })}
            />
            <Input
              label="Password (optional)"
              type="password"
              value={domainForm.password}
              onChange={(e) => setDomainForm({ ...domainForm, password: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDomainOpen(false)}>Cancel</Button>
            <Button onClick={() => addDomainMutation.mutate(domainForm)} disabled={!domainForm.domain || !domainForm.relayHost}>
              Add Domain Relay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
