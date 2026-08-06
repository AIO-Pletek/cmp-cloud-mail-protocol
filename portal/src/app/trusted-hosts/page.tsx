'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  Shield, Plus, Trash2, TestTube, CheckCircle, XCircle, Loader2,
  Server, Globe, Lock, AlertTriangle, Info, ToggleLeft, ToggleRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TrustedHostsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const [form, setForm] = useState({
    address: '',
    label: '',
    authType: 'ip',
    username: '',
    password: '',
  });

  const { data: hostsData, isLoading } = useQuery({
    queryKey: ['trusted-hosts'],
    queryFn: () => cmpApi.trustedHosts.list(),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['trusted-hosts-stats'],
    queryFn: () => cmpApi.trustedHosts.stats(),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => cmpApi.trustedHosts.add(data),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Trusted host added');
      setAddOpen(false);
      setForm({ address: '', label: '', authType: 'ip', username: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['trusted-hosts'] });
    },
    onError: () => toast.error('Failed to add trusted host'),
  });

  const removeMutation = useMutation({
    mutationFn: (address: string) => cmpApi.trustedHosts.remove(address),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Trusted host removed');
      queryClient.invalidateQueries({ queryKey: ['trusted-hosts'] });
    },
    onError: () => toast.error('Failed to remove trusted host'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ address, enabled }: { address: string; enabled: boolean }) =>
      cmpApi.trustedHosts.toggle(address, enabled),
    onSuccess: () => {
      toast.success('Host status updated');
      queryClient.invalidateQueries({ queryKey: ['trusted-hosts'] });
    },
    onError: () => toast.error('Failed to update host status'),
  });

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await cmpApi.trustedHosts.test(form.address);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const hosts = hostsData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trusted Relay Hosts</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage origin mail servers that can relay email through CMP Gateway
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Trusted Host
        </Button>
      </div>

      {/* Flow Diagram */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <p className="font-medium text-blue-900">How Mail Relay Works</p>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
              <Server className="w-4 h-4 text-gray-500" />
              <span className="font-medium">Your Mail Server</span>
            </div>
            <div className="text-blue-600 font-mono">→ SMTP →</div>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-300">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-700">CMP Gateway</span>
              <span className="text-xs text-gray-500">(spam filter)</span>
            </div>
            <div className="text-blue-600 font-mono">→ SMTP →</div>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="font-medium">Internet</span>
            </div>
          </div>
          <p className="text-xs text-blue-700 mt-3 text-center">
            Only trusted hosts can relay email through CMP. Add your mail server IP/hostname below.
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Trusted Hosts</p>
                <p className="text-2xl font-bold text-gray-900">{hosts.length}</p>
              </div>
              <Server className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Emails Relayed</p>
                <p className="text-2xl font-bold text-green-600">{stats?.totalRelayed || 0}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{stats?.totalRejected || 0}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hosts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Trusted Hosts</CardTitle>
          <CardDescription>
            These servers are allowed to relay email through CMP for spam/virus filtering
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Server className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">No trusted hosts configured</p>
              <p className="text-sm mt-1">Add your mail server IP to start relaying through CMP</p>
              <Button variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add First Host
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Auth Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{host.address}</TableCell>
                    <TableCell>{host.label || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={host.type === 'ip' ? 'info' : host.type === 'cidr' ? 'default' : 'warning'}>
                        {host.type === 'ip' ? 'IP Address' : host.type === 'cidr' ? 'CIDR Range' : host.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMutation.mutate({
                            address: host.address,
                            enabled: !host.enabled
                          })}
                          className="flex items-center gap-1"
                        >
                          {host.enabled ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <Badge variant={host.enabled ? 'success' : 'outline'}>
                          {host.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{host.source || 'manual'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Remove"
                        onClick={() => removeMutation.mutate(host.address)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Authentication Methods Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Authentication Methods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">IP Address</h4>
              <p className="text-sm text-gray-600">
                Trust by IP address or CIDR range. Simplest method — add your server IP and it can relay immediately.
              </p>
              <Badge variant="info" className="mt-2">Recommended for start</Badge>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">SMTP AUTH</h4>
              <p className="text-sm text-gray-600">
                Username/password authentication. More secure — origin server authenticates before relaying.
              </p>
              <Badge variant="warning" className="mt-2">More secure</Badge>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">TLS Certificate</h4>
              <p className="text-sm text-gray-600">
                Client certificate verification. Most secure — requires TLS client cert on origin server.
              </p>
              <Badge variant="success" className="mt-2">Most secure</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Host Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Trusted Relay Host</DialogTitle>
            <DialogDescription>
              Add your mail server that will relay outbound email through CMP for filtering
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Server IP / CIDR"
              placeholder="203.0.113.10 or 203.0.113.0/24"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <Input
              label="Label (optional)"
              placeholder="Mail server Jakarta"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Authentication Type</label>
              <div className="flex gap-2">
                {['ip', 'smtp_auth', 'tls_cert'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setForm({ ...form, authType: type })}
                    className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                      form.authType === type
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {type === 'ip' ? 'IP Address' : type === 'smtp_auth' ? 'SMTP AUTH' : 'TLS Cert'}
                  </button>
                ))}
              </div>
            </div>

            {form.authType === 'smtp_auth' && (
              <>
                <Input
                  label="SMTP Username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <Input
                  label="SMTP Password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </>
            )}

            {/* Test Connection */}
            {form.address && (
              <div>
                {testResult && (
                  <div className={`p-3 rounded-lg border mb-2 ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                      <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>{testResult.message}</p>
                    </div>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <TestTube className="w-4 h-4 mr-1" />}
                  Test Connection to Origin Server
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate(form)} disabled={!form.address || addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Add Trusted Host
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
