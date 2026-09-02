'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Palette, Globe, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BrandingPage() {
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [accentColor, setAccentColor] = useState('#8b5cf6');
  const [customDomain, setCustomDomain] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleLogoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSaving(false);
    toast.success('Branding settings saved');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Branding</h2>
          <p className="text-sm text-gray-500 mt-1">Customize the look and feel of your CMP portal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        <div className="space-y-6">
          {/* Logo */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Logo</CardTitle></CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleLogoDrop}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                onClick={() => document.getElementById('logo-input')?.click()}
              >
                {logo ? (
                  <img src={logo} alt="Logo" className="max-h-20 mx-auto" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Drag & drop your logo here, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, SVG, or WebP. Max 2MB.</p>
                  </>
                )}
                <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogoInput} />
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5" /> Colors</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Primary Color', value: primaryColor, setter: setPrimaryColor },
                { label: 'Secondary Color', value: secondaryColor, setter: setSecondaryColor },
                { label: 'Accent Color', value: accentColor, setter: setAccentColor },
              ].map((color: any) => (
                <div key={color.label} className="flex items-center gap-3">
                  <label className="w-32 text-sm font-medium text-gray-700">{color.label}</label>
                  <input
                    type="color"
                    value={color.value}
                    onChange={(e) => color.setter(e.target.value)}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={color.value}
                    onChange={(e) => color.setter(e.target.value)}
                    className="flex-1 h-10 px-3 rounded border border-gray-300 text-sm font-mono"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Custom Domain */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5" /> Custom Domain</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Custom Domain"
                placeholder="mail.yourdomain.com"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                helperText="Point a CNAME record to portal.cmp-mail.com"
              />
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Branding Settings
          </Button>
        </div>

        {/* Preview */}
        <Card className="sticky top-24">
          <CardHeader><CardTitle>Live Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Mini sidebar */}
              <div className="flex">
                <div className="w-16 bg-gray-100 p-2 flex flex-col items-center gap-3 border-r border-gray-200">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                    <span className="text-white text-xs font-bold">C</span>
                  </div>
                  <div className="w-6 h-6 rounded bg-gray-200" />
                  <div className="w-6 h-6 rounded bg-gray-200" />
                  <div className="w-6 h-6 rounded bg-gray-200" />
                </div>
                <div className="flex-1">
                  {/* Header */}
                  <div className="h-10 border-b border-gray-200 flex items-center justify-between px-3">
                    <span className="text-xs font-medium text-gray-700">Dashboard</span>
                    <div className="w-5 h-5 rounded-full" style={{ backgroundColor: accentColor }} />
                  </div>
                  {/* Content */}
                  <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                      {[1, 2, 3].map((i: any) => (
                        <div key={i} className="flex-1 h-14 rounded border border-gray-200 p-2">
                          <div className="w-full h-1.5 bg-gray-100 rounded mb-1" />
                          <div className="text-xs font-bold text-gray-700">1,234</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-20 rounded border border-gray-200 p-2">
                      <div className="w-1/3 h-1.5 bg-gray-100 rounded mb-2" />
                      <div className="h-12 rounded" style={{ backgroundColor: primaryColor + '15' }} />
                    </div>
                    <button
                      className="text-xs text-white px-3 py-1.5 rounded font-medium"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Sample Button
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
