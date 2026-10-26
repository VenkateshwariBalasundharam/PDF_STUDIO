export interface TenantContext {
  tenantId: string;
  name: string;
  plan: string;
}

export interface UserSession {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}

export interface DocumentDto {
  id: string;
  tenantId: string;
  title: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  pageCount: number;
  storagePath: string;
  sha256Checksum: string;
  version: number;
  status: string;
  isFavorite: boolean;
  isArchived: boolean;
  createdAtUtc: string;
  expiresAtUtc?: string;
}

export interface TemplateDto {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  engine: string;
  htmlContent: string;
  headerHtml?: string;
  footerHtml?: string;
  defaultOrientation: string;
  defaultPageSize: string;
  currentVersion: number;
  isActive: boolean;
  fields?: TemplateFieldDto[];
}

export interface TemplateFieldDto {
  id?: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue?: string;
}

export interface PdfJobDto {
  id: string;
  tenantId: string;
  jobType: string;
  status: 'Queued' | 'Processing' | 'Completed' | 'Failed' | 'Cancelled';
  progressPercent: number;
  payloadJson?: string;
  resultDocumentId?: string;
  errorMessage?: string;
  createdAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
}

export interface GeneratePdfRequest {
  title?: string;
  htmlContent?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  pageSize?: string;
  orientation?: string;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  printBackground?: boolean;
  doNotSave?: boolean;
  async?: boolean;
  webhookUrl?: string;
}

export interface ApiClientDto {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  apiKeyPrefix: string;
  isActive: boolean;
  allowedIpRanges?: string;
  rateLimitPerMinute: number;
  createdAtUtc: string;
  lastUsedAtUtc?: string;
}

export interface DashboardMetricsDto {
  totalPdfsGenerated: number;
  activeJobsCount: number;
  totalDocumentsStored: number;
  activeTemplatesCount: number;
  storageUsedBytes: number;
  averageGenerationTimeMs: number;
  /** PDFs saved today (local time). */
  generatedToday?: number;
  /** Saved PDFs per day for the last 7 days, oldest first. */
  generatedLast7Days?: number[];
  /** How many measured generations the average is based on. */
  latencySamples?: number;
}

