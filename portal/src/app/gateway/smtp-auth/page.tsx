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
  Key, Plus, Trash2, Copy, Eye, EyeOff, Loader2, CheckCircle,
  Server, Lock, FileText, ToggleLeft, ToggleRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SmtpAuthPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newCred, setNewCred] = useState<any>(null);
  const [instructions, setInstructions] = useState<any>(null);
  const [instructionsUser, setInstructionsUser] = useState('');

  const [form, setForm] = useState({
    username: '',
    password: '',
    label: '',
    allowedIps: '',
  });

  const { data: credsData, isLoading } = useQuery({
    queryKey: ['smtp-auth-creds'],
    queryFn: () => cmpApi.smtpAuth.credentials(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => cmpApi.smtpAuth.createCredential(data),
    onSuccess: (data: any) => {
      setNewCred(data);
      toast.success('Credential created - save the password!');
      queryClient.invalidateQueries({ queryKey: ['smtp-auth-creds'] });
    },
    onError: () => toast.error('Failed to create credential'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmpApi.smtpAuth.deleteCredential(id),
    onSuccess: () => {
      toast.success('Credential deleted');
      queryClient.invalidateQueries({ queryKey: ['smtp-auth-creds'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      cmpApi.smtpAuth.toggleCredential(id, enabled),
    onSuccess: () => {
      toast.success('Credential updated');
      queryClient.invalidateQueries({ queryKey: ['smtp-auth-creds'] });
    },
  });

  const loadInstructions = async (username: string) => {
    try {
      const data = await cmpApi.smtpAuth.instructions(username);
      setInstructions(data);
      setInstructionsUser(username);
    } catch {
      toast.error('Failed to load instructions');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const creds = credsData?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">SMTP Auth Credentials</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage username/password credentials for relay authentication
          </p>
        </div>
        <Button onClick={() => { setAddOpen(true); setNewCred(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Create Credential
        </Button>
      </div>

      {/* How It Works */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-5 h-5 text-blue-600" />
            <p className="font-medium text-blue-900">How SMTP AUTH Works</p>
          </div>
          <div className="text-sm text-blue-800 space-y-1">
            <p>1. Create credentials here (username + password)</p>
            <p>2. Configure your mail server to authenticate with those credentials</p>
            <p>3. When your server sends email, it authenticates → CMP verifies → email gets filtered and delivered</p>
          </div>
        </CardContent>
      </Card>

      {/* Credentials List */}
      <Card>
        <CardHeader>
          <CardTitle>Active Credentials</CardTitle>
          <CardDescription>Each origin server should have its own credential</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : creds.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No credentials configured</p>
              <p className="text-sm mt-1">Create credentials for each server that will relay through CMP</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3">Username</th>
                  <th className="text-left p-3">Label</th>
                  <th className="text-left p-3">Password</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Usage</th>
                  <th className="text-left p-3">Last Used</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((cred: any) => (
                  <tr key={cred.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono font-medium">{cred.username}</td>
                    <td className="p-3">{cred.label}</td>
                    <td className="p-3">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{cred.passwordPreview}</code>
                    </td>
                    <td className="p-3">
                      <button onClick={() => toggleMutation.mutate({ id: cred.id, enabled: !cred.enabled })}>
                        {cred.enabled ? (
                          <ToggleRight className="w-5 h-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 text-gray-500">{cred.usageCount}x</td>
                    <td className="p-3 text-gray-500 text-xs">{cred.lastUsed || 'Never'}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="View Config Instructions"
                          onClick={() => loadInstructions(cred.username)}>
                          <FileText className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete"
                          onClick={() => deleteMutation.mutate(cred.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Config Instructions */}
      {instructions && (
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Configuration for: {instructionsUser}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setInstructions(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Server</p>
                <p className="font-mono font-medium">{instructions.server}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Port</p>
                <p className="font-mono font-medium">{instructions.ports?.submission} (STARTTLS) / {instructions.ports?.smtps} (SSL)</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Username</p>
                <p className="font-mono font-medium">{instructions.username}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">TLS</p>
                <p className="font-mono font-medium">{instructions.tls}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">Postfix Configuration</p>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(instructions.postfix_config)}>
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="bg-gray-900 text-gray-200 p-4 rounded-lg text-xs font-mono overflow-x-auto">
                {instructions.postfix_config}
              </pre>
            </div>

            {instructions.cpanel_config && (
              <div>
                <p className="font-medium text-sm mb-2">cPanel / DirectAdmin / WHM</p>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">SMTP Server:</span>
                    <span className="font-mono">{instructions.cpanel_config.smtp_server}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Port:</span>
                    <span className="font-mono">{instructions.cpanel_config.smtp_port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Authentication:</span>
                    <span className="font-mono">{instructions.cpanel_config.smtp_auth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Username:</span>
                    <span className="font-mono">{instructions.cpanel_config.smtp_username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">TLS:</span>
                    <span className="font-mono">{instructions.cpanel_config.smtp_tls}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create SMTP Auth Credential</DialogTitle>
            <DialogDescription>
              Create a username/password for a server to authenticate when relaying through CMP
            </DialogDescription>
          </DialogHeader>

          {newCred ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-green-900">Credential Created!</p>
                </div>
                <p className="text-sm text-green-700 mb-3">Save these credentials now. The password won't be shown again.</p>
                <div className="space-y-2">
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs text-gray-500">Username</p>
                    <p className="font-mono font-medium">{newCred.username}</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Password</p>
                        <p className="font-mono font-medium">{showPassword ? newCred.password : '••••••••••••••••'}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(newCred.password)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Server:</strong> mailprotocol.cbncloud.net<br />
                  <strong>Port:</strong> 587 (STARTTLS) or 465 (SSL)<br />
                  <strong>Auth:</strong> PLAIN or LOGIN
                </p>
              </div>
              <Button onClick={() => { setAddOpen(false); setNewCred(null); }} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <Input
                  label="Username"
                  placeholder="relay-jakarta"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <Input
                  label="Label (optional)"
                  placeholder="Server Jakarta DC"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
                <Input
                  label="Password (leave empty to auto-generate)"
                  type="password"
                  placeholder="Auto-generate if empty"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <Input
                  label="Allowed IPs (comma separated, optional)"
                  placeholder="203.0.113.10, 192.168.1.0/24"
                  value={form.allowedIps}
                  onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate({
                  username: form.username,
                  password: form.password || undefined,
                  label: form.label,
                  allowed_ips: form.allowedIps ? form.allowedIps.split(',').map(s => s.trim()) : [],
                })} disabled={!form.username || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Create Credential
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
