import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, forkJoin, defer, from } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { 
  DocumentDto, 
  TemplateDto, 
  PdfJobDto, 
  GeneratePdfRequest, 
  ApiClientDto, 
  DashboardMetricsDto 
} from '../models/api.models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly publicApiBase = 'http://localhost:5000/api/v1/public';
  private readonly privateApiBase = 'http://localhost:5001/api/v1/private';

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private getPublicHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'X-API-Key': this.auth.getApiKey(),
      'X-Tenant-Id': this.auth.getTenantId()
    });
  }

  private getPrivateHeaders(): HttpHeaders {
    const session = this.auth.getSession();
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Tenant-Id': this.auth.getTenantId()
    });
    if (session?.token) {
      headers = headers.set('Authorization', `Bearer ${session.token}`);
    }
    return headers;
  }

  // Dashboard: real numbers from the Documents and Jobs lists, plus latency measured in this browser
  getMetrics(): Observable<DashboardMetricsDto> {
    return forkJoin({ docs: this.getAllDocuments(), jobs: this.getJobs() }).pipe(
      map(({ docs, jobs }) => {
        const lat = this.readLatency();
        const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const today = day(new Date());
        const daily = [0, 0, 0, 0, 0, 0, 0];
        for (const d of docs) {
          const ago = Math.round((today - day(new Date(d.createdAtUtc))) / 86400000);
          if (ago >= 0 && ago < 7) daily[6 - ago]++;
        }
        return {
          totalPdfsGenerated: docs.length,
          activeJobsCount: jobs.filter(j => j.status === 'Queued' || j.status === 'Processing').length,
          totalDocumentsStored: docs.length,
          activeTemplatesCount: 0,
          storageUsedBytes: docs.reduce((n, d) => n + (d.fileSizeBytes || 0), 0),
          averageGenerationTimeMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
          generatedToday: daily[6],
          generatedLast7Days: daily,
          latencySamples: lat.length
        };
      })
    );
  }

  /** Every saved document of the tenant (pages of 100, up to 2,000). */
  private getAllDocuments(): Observable<DocumentDto[]> {
    return defer(() => from((async () => {
      const all: DocumentDto[] = [];
      try {
        const headers = await new Promise<HttpHeaders>((res, rej) => this.bearerHeaders().subscribe({ next: res, error: rej }));
        for (let page = 1; page <= 20; page++) {
          const r: any = await new Promise((res, rej) =>
            this.http.get(`${this.publicApiBase}/documents?size=100&page=${page}`, { headers }).subscribe({ next: res, error: rej }));
          const items: any[] = r?.data?.items ?? [];
          if (!items.length) break;
          for (const d of items) {
            all.push({
              id: d.documentId, tenantId: this.auth.getTenantId(), title: d.title, fileName: `${d.documentId}.pdf`,
              contentType: 'application/pdf', fileSizeBytes: d.fileSizeBytes ?? 0, pageCount: d.pageCount ?? 1,
              storagePath: '', sha256Checksum: '', version: d.versionNumber ?? 1, status: 'Ready',
              isFavorite: !!d.isFavorite, isArchived: d.status === 'archived', createdAtUtc: d.createdAtUtc
            });
          }
        }
      } catch (e) { console.error('Could not load documents for the dashboard', e); }
      return all;
    })()));
  }

  private readonly LAT_KEY = 'pdfstudio.genLatency.v1';
  private readLatency(): number[] {
    try { const a = JSON.parse(localStorage.getItem(this.LAT_KEY) ?? '[]'); return Array.isArray(a) ? a.filter(n => typeof n === 'number') : []; } catch { return []; }
  }
  /** Keeps the last 50 PDF generation times measured in this browser. */
  private recordLatency(ms: number): void {
    try { localStorage.setItem(this.LAT_KEY, JSON.stringify([...this.readLatency(), Math.round(ms)].slice(-50))); } catch { /* storage blocked */ }
  }

  // PDF Generation
  private devToken: string | null = null;

  // Development-only token from the Public API (acme tenant, all scopes)
  private getDevToken(): Observable<string> {
    if (this.devToken) {
      return of(this.devToken);
    }
    return this.http
      .post<{ accessToken: string }>(`${this.publicApiBase}/auth/dev-token`, {})
      .pipe(
        tap(r => (this.devToken = r.accessToken)),
        map(r => r.accessToken)
      );
  }

  generatePdf(request: GeneratePdfRequest): Observable<Blob | { jobId: string }> {
    const body = {
      title: request.title,
      htmlContent: request.htmlContent,
      pageSize: request.pageSize,
      orientation: request.orientation,
      marginTopMm: request.marginTopMm,
      marginBottomMm: request.marginBottomMm,
      marginLeftMm: request.marginLeftMm,
      marginRightMm: request.marginRightMm,
      printBackground: request.printBackground,
      templateId: request.templateId,
      templateData: request.templateData,
      doNotSave: request.doNotSave
    };
    if (request.async) {
      // Background mode: queue a job; the Worker renders the PDF and saves it to Documents
      const jobBody = {
        templateId: body.templateId,
        htmlContent: body.templateId ? undefined : body.htmlContent,
        data: body.templateData,
        pageSize: body.pageSize,
        orientation: body.orientation,
        printBackground: body.printBackground
      };
      return this.getDevToken().pipe(
        switchMap(token =>
          this.http.post<any>(`${this.publicApiBase}/pdf/jobs`, jobBody, {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            })
          })
        ),
        map(res => ({ jobId: res?.data?.jobId as string })),
        tap({ error: () => (this.devToken = null) })
      );
    }

    return this.getDevToken().pipe(
      switchMap(token => {
        const t0 = performance.now();
        return this.http.post(`${this.publicApiBase}/pdf/render`, body, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }),
          responseType: 'blob'
        }).pipe(tap(() => this.recordLatency(performance.now() - t0)));
      }),
      tap({ error: () => (this.devToken = null) }),
      // The render call asks for a Blob, so a server error arrives as a Blob too. Decode it so the real reason is shown.
      catchError(err => from((async () => {
        let message = '';
        try {
          const b = err?.error;
          const text = b instanceof Blob ? await b.text() : (typeof b === 'string' ? b : '');
          if (text) message = (JSON.parse(text)?.message as string) || text.slice(0, 300);
        } catch { /* body was not JSON */ }
        if (!message && err?.status) message = `The Public API answered with HTTP ${err.status}.`;
        throw { ...err, error: { message: message || undefined } };
      })()))
    );
  }

  // Templates
  getTemplates(): Observable<TemplateDto[]> {
    return this.http.get<TemplateDto[]>(`${this.privateApiBase}/templates`, {
      headers: this.getPrivateHeaders()
    }).pipe(
      catchError(() => of([
        {
          id: 'tpl-invoice-01',
          tenantId: this.auth.getTenantId(),
          name: 'Commercial Invoice',
          description: 'Standard multi-currency invoice template with itemized table',
          engine: 'Mustache',
          htmlContent: '<h1>Invoice {{invoiceNumber}}</h1><p>Customer: {{customerName}}</p><p>Total: {{totalAmount}}</p>',
          defaultOrientation: 'Portrait',
          defaultPageSize: 'A4',
          currentVersion: 1,
          isActive: true
        },
        {
          id: 'tpl-receipt-02',
          tenantId: this.auth.getTenantId(),
          name: 'Payment Receipt',
          description: 'Compact transaction receipt with QR code placeholder',
          engine: 'Mustache',
          htmlContent: '<h2>Receipt #{{receiptId}}</h2><p>Amount Paid: {{amount}}</p>',
          defaultOrientation: 'Portrait',
          defaultPageSize: 'Letter',
          currentVersion: 2,
          isActive: true
        }
      ]))
    );
  }

  /**
   * Real, renderable templates from the Public API (same tenant the render call uses).
   * `id` is the template KEY (e.g. "invoice-standard"), which is what /pdf/render expects.
   * Unlike getTemplates(), there is no fake fallback list: if the API is down you get an empty list.
   */
  getRenderableTemplates(): Observable<TemplateDto[]> {
    return this.bearerHeaders().pipe(
      switchMap(headers => this.http.get<any>(`${this.publicApiBase}/templates?size=100`, { headers })),
      map(res => {
        const items: any[] = res?.data?.items ?? [];
        return items
          .filter(t => (t.status ?? 'active') === 'active' && t.currentVersionNumber != null) // published only; drafts can't be rendered
          .map((t: any): TemplateDto => ({
            id: t.key,
            tenantId: this.auth.getTenantId(),
            name: t.name,
            description: t.description,
            engine: 'Mustache',
            htmlContent: '',
            defaultOrientation: 'Portrait',
            defaultPageSize: 'A4',
            currentVersion: t.currentVersionNumber,
            isActive: true
          }));
      }),
      tap({ error: () => (this.devToken = null) }),
      catchError(err => {
        console.error('Could not load templates', err);
        return of([] as TemplateDto[]);
      })
    );
  }

  getTemplate(id: string): Observable<TemplateDto> {
    return this.http.get<TemplateDto>(`${this.privateApiBase}/templates/${id}`, {
      headers: this.getPrivateHeaders()
    });
  }

  saveTemplate(template: Partial<TemplateDto>): Observable<TemplateDto> {
    return this.http.post<TemplateDto>(`${this.privateApiBase}/templates`, template, {
      headers: this.getPrivateHeaders()
    });
  }

  // Documents (real data from the Public API, authenticated with the dev token)
  private bearerHeaders(): Observable<HttpHeaders> {
    return this.getDevToken().pipe(
      map(token => new HttpHeaders({ Authorization: `Bearer ${token}` }))
    );
  }

  getDocuments(): Observable<DocumentDto[]> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.get<{ data: { items: any[] } }>(`${this.publicApiBase}/documents?size=100`, { headers })
      ),
      map(res =>
        (res?.data?.items ?? []).map(
          (d: any): DocumentDto => ({
            id: d.documentId,
            tenantId: this.auth.getTenantId(),
            title: d.title,
            fileName: `${d.documentId}.pdf`,
            contentType: 'application/pdf',
            fileSizeBytes: d.fileSizeBytes ?? 0,
            pageCount: d.pageCount ?? 1,
            storagePath: '',
            sha256Checksum: '',
            version: d.versionNumber ?? 1,
            status: 'Ready',
            isFavorite: !!d.isFavorite,
            isArchived: d.status === 'archived',
            createdAtUtc: d.createdAtUtc
          })
        )
      ),
      catchError(err => {
        console.error('Could not load documents', err);
        return of([] as DocumentDto[]);
      })
    );
  }

  downloadDocument(id: string): Observable<Blob> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.get(`${this.publicApiBase}/documents/${id}/download`, {
          headers,
          responseType: 'blob'
        })
      )
    );
  }

  /** Saves a PDF the browser already holds (for example a password-locked one) to Documents under the given name. */
  saveDocument(title: string, pdf: Blob): Observable<unknown> {
    return from(new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(pdf);
    })).pipe(
      switchMap(pdfBase64 => this.bearerHeaders().pipe(
        switchMap(headers => this.http.post(`${this.publicApiBase}/documents/upload`, { title, pdfBase64 }, { headers }))
      ))
    );
  }

  deleteDocument(id: string): Observable<unknown> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.delete(`${this.publicApiBase}/documents/${encodeURIComponent(id)}`, { headers })
      )
    );
  }

  clearDocuments(): Observable<unknown> {
    return this.bearerHeaders().pipe(
      switchMap(headers => this.http.delete(`${this.publicApiBase}/documents`, { headers }))
    );
  }

  toggleFavoriteDocument(id: string, isFavorite?: boolean): Observable<any> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.put<{ data: any }>(
          `${this.publicApiBase}/documents/${encodeURIComponent(id)}/favorite`,
          isFavorite !== undefined ? { isFavorite } : {},
          { headers }
        )
      ),
      map(res => res?.data)
    );
  }

  toggleArchiveDocument(id: string, isArchived?: boolean): Observable<any> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.put<{ data: any }>(
          `${this.publicApiBase}/documents/${encodeURIComponent(id)}/archive`,
          isArchived !== undefined ? { isArchived } : {},
          { headers }
        )
      ),
      map(res => res?.data)
    );
  }

  clearJobs(all = false): Observable<unknown> {
    return this.bearerHeaders().pipe(
      switchMap(headers => this.http.delete(`${this.publicApiBase}/jobs${all ? '?all=true' : ''}`, { headers }))
    );
  }

  // Jobs (real data from the Public API)
  getJobs(): Observable<PdfJobDto[]> {
    return this.bearerHeaders().pipe(
      switchMap(headers =>
        this.http.get<{ data: { items: any[] } }>(`${this.publicApiBase}/jobs?size=50`, { headers })
      ),
      map(res =>
        (res?.data?.items ?? []).map(
          (j: any): PdfJobDto => ({
            id: j.id,
            tenantId: this.auth.getTenantId(),
            jobType: j.jobType,
            status: j.status,
            progressPercent: j.progressPercent ?? 0,
            resultDocumentId: j.resultDocumentId ?? undefined,
            errorMessage: j.errorMessage ?? undefined,
            createdAtUtc: j.createdAtUtc,
            completedAtUtc: j.completedAtUtc ?? undefined
          })
        )
      ),
      catchError(err => {
        console.error('Could not load jobs', err);
        return of([] as PdfJobDto[]);
      })
    );
  }

  getJob(id: string): Observable<PdfJobDto> {
    return this.http.get<PdfJobDto>(`${this.publicApiBase}/jobs/${id}`, {
      headers: this.getPublicHeaders()
    });
  }

  // API Management
  getApiClients(): Observable<ApiClientDto[]> {
    return this.http.get<ApiClientDto[]>(`${this.privateApiBase}/api-clients`, {
      headers: this.getPrivateHeaders()
    }).pipe(
      catchError(() => of([
        {
          id: 'client-1',
          tenantId: this.auth.getTenantId(),
          name: 'Billing Backend Gateway',
          apiKeyPrefix: 'pdf_live_92f',
          isActive: true,
          rateLimitPerMinute: 600,
          createdAtUtc: new Date().toISOString()
        },
        {
          id: 'client-2',
          tenantId: this.auth.getTenantId(),
          name: 'ERP Invoicing Connector',
          apiKeyPrefix: 'pdf_test_31a',
          isActive: true,
          rateLimitPerMinute: 120,
          createdAtUtc: new Date(Date.now() - 172800000).toISOString()
        }
      ]))
    );
  }

  createApiClient(name: string, rateLimit: number): Observable<{ client: ApiClientDto; rawApiKey: string }> {
    return this.http.post<{ client: ApiClientDto; rawApiKey: string }>(
      `${this.privateApiBase}/api-clients`, 
      { name, rateLimitPerMinute: rateLimit }, 
      { headers: this.getPrivateHeaders() }
    );
  }
}

