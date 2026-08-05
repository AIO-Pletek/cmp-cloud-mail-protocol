export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  logoPath: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customDomain: string | null;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
}

export interface Domain {
  id: string;
  domainName: string;
  isVerified: boolean;
  dkimSelector: string;
  dkimPublicKey: string;
  spfRecord: string;
  dmarcRecord: string;
  mxRecord: string;
  isActive: boolean;
  emailCount: number;
  spamBlocked: number;
  createdAt: string;
}

export interface FilterRule {
  id: string;
  domainId: string;
  tenantId: string;
  ruleType: 'whitelist' | 'blacklist' | 'content';
  matchType: 'exact' | 'regex' | 'contains';
  pattern: string;
  action: 'allow' | 'block' | 'quarantine';
  priority: number;
  isActive: boolean;
  description: string;
  createdAt: string;
}

export interface QuarantineItem {
  id: string;
  domainId: string;
  sender: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  spamScore: number;
  reason: string;
  status: 'pending' | 'released' | 'deleted' | 'expired';
  createdAt: string;
}

export interface QuarantineStats {
  total: number;
  pending: number;
  released: number;
  deleted: number;
  expired: number;
  avgSpamScore: number;
}

export interface TrafficStats {
  period: string;
  totalIncoming: number;
  totalOutgoing: number;
  totalSpam: number;
  totalVirus: number;
  byDomain: Array<{ domain: string; incoming: number; outgoing: number; spam: number }>;
  byHour: Array<{ hour: string; incoming: number; outgoing: number; spam: number }>;
}

export interface DomainHealth {
  domain: string;
  mxOk: boolean;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  score: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}
