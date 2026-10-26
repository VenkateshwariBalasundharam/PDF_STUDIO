import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { UnlockComponent } from './components/unlock/unlock.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { PdfGeneratorComponent } from './components/pdf-generator/pdf-generator.component';
import { DesignEditorComponent } from './components/design-editor/design-editor.component';
import { EditorComponent } from './components/editor/editor.component';
import { TemplatesComponent } from './components/templates/templates.component';
import { DocumentsComponent } from './components/documents/documents.component';
import { JobsComponent } from './components/jobs/jobs.component';
import { ApiManagementComponent } from './components/api-management/api-management.component';
import { AdminComponent } from './components/admin/admin.component';
import { DeveloperPortalComponent } from './components/developer-portal/developer-portal.component';

const secured = (r: { path: string; component: any }) => ({ ...r, canActivate: [authGuard] });

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  ...[
    { path: 'dashboard', component: DashboardComponent },
    { path: 'generate', component: PdfGeneratorComponent },
    { path: 'editor', component: DesignEditorComponent },
    { path: 'code-editor', component: EditorComponent },
    { path: 'unlock', component: UnlockComponent },
    { path: 'templates', component: TemplatesComponent },
    { path: 'documents', component: DocumentsComponent },
    { path: 'jobs', component: JobsComponent },
    { path: 'api-management', component: ApiManagementComponent },
    { path: 'developer', component: DeveloperPortalComponent }
  ].map(secured),
  { path: 'admin', component: AdminComponent, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: 'dashboard' }
];
